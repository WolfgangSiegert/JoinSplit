import { describe, expect, test } from 'vitest'
import fixture from '../../../docs/architecture/fixtures/settlement-vectors.json'
import type { Group, Participant } from '../../app/domain/create-group'
import { calculateParticipantBalances } from '../../app/domain/balance'
import {
  INT64_MAX,
  applySettlementToBalances,
  assessSettlement,
  isCanonicalPositiveMinor,
  parseSettlementAmountMinor,
  prepareSettlementDelete,
  prepareSettlementSave,
  restoreSettlement,
  serializeSettlement,
  type Settlement,
} from '../../app/domain/settlement'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const DEBTOR_ID = '33333333-3333-4333-8333-333333333333'
const CREDITOR_ID = '44444444-4444-4444-8444-444444444444'
const SETTLEMENT_ID = '55555555-5555-4555-8555-555555555555'
const MUTATION_ID = '66666666-6666-4666-8666-666666666666'
const participants: Participant[] = [
  { id: DEBTOR_ID, groupId: GROUP_ID, name: 'Debtor', status: 'active', order: 0 },
  { id: CREDITOR_ID, groupId: GROUP_ID, name: 'Creditor', status: 'active', order: 1 },
]
const group: Group = { id: GROUP_ID, name: 'Reise', currency: 'EUR', ownerAccessIdentityId: ACTOR_ID, status: 'active', hasFinancialHistory: false, participantIds: participants.map(item => item.id) }
const balances = new Map([[DEBTOR_ID, -1000n], [CREDITOR_ID, 1000n]])

interface FixtureSettlement { senderParticipantId: string; receiverParticipantId: string; amountMinor: string }
interface SettlementVector {
  name: string
  groupStatus: 'active' | 'archived'
  participants: Array<{ participantId: string; status: 'active' | 'inactive'; balanceAmountMinor: string }>
  existingSettlement?: FixtureSettlement
  operation: { type: 'create' | 'update' | 'delete'; settlement?: FixtureSettlement }
  expected: {
    decision: 'accept' | 'confirm' | 'reject'
    confirmationReasons?: Array<'wrong_direction' | 'exceeds_open_amount'>
    rejectionReason?: string
    balancesBeforeCandidate?: Array<{ participantId: string; balanceAmountMinor: string }>
    balancesAfter?: Array<{ participantId: string; balanceAmountMinor: string }>
  }
}
const settlementVectors = fixture.validationAndBalanceVectors as unknown as SettlementVector[]

function expectBalances(actual: ReadonlyMap<string, bigint>, expected: SettlementVector['expected']['balancesAfter']): void {
  expect([...actual].map(([participantId, balanceAmountMinor]) => ({ participantId, balanceAmountMinor: balanceAmountMinor.toString(10) }))).toEqual(expected)
}

describe('Settlement domain', () => {
  test.each(settlementVectors)('applies shared Settlement financial vector: $name', vector => {
    const participantRecords = vector.participants.map((participant, order): Participant => ({
      id: participant.participantId, groupId: GROUP_ID, name: participant.participantId,
      status: participant.status, order,
    }))
    const currentBalances = new Map(vector.participants.map(participant => [participant.participantId, BigInt(participant.balanceAmountMinor)]))
    const existing = vector.existingSettlement && { ...vector.existingSettlement, amountMinor: BigInt(vector.existingSettlement.amountMinor) }
    if (vector.operation.type === 'delete') {
      expect(existing).toBeDefined()
      const after = applySettlementToBalances(currentBalances, existing!, 'reverse')
      expect(vector.expected.decision).toBe('accept')
      expectBalances(after, vector.expected.balancesAfter)
      return
    }
    const candidate = vector.operation.settlement
    const amount = candidate && isCanonicalPositiveMinor(candidate.amountMinor) ? BigInt(candidate.amountMinor) : null
    if (vector.expected.rejectionReason === 'amount_out_of_range') {
      expect(vector.expected.decision).toBe('reject')
      expect(amount).toBeNull()
      return
    }
    if (vector.groupStatus === 'archived') {
      expect(vector.expected).toMatchObject({ decision: 'reject', rejectionReason: 'group_archived' })
      expect(() => prepareSettlementSave({ group: { ...group, status: 'archived' }, participants: participantRecords, pendingMutations: [], balancesBeforeCandidate: new Map(), actorId: ACTOR_ID, draft: { senderParticipantId: '', receiverParticipantId: '', amount: '1', occurredOn: '2026-09-24' } })).toThrow('Active group')
      return
    }
    expect(amount).not.toBeNull()
    if (amount === null || !candidate) return
    const balancesBeforeCandidate = existing ? applySettlementToBalances(currentBalances, existing, 'reverse') : currentBalances
    if (vector.expected.balancesBeforeCandidate) expectBalances(balancesBeforeCandidate, vector.expected.balancesBeforeCandidate)
    const sender = participantRecords.find(item => item.id === candidate.senderParticipantId)!
    const receiver = participantRecords.find(item => item.id === candidate.receiverParticipantId)!
    const assessment = assessSettlement(sender, receiver, amount, balancesBeforeCandidate)
    expect(assessment.decision).toBe(vector.expected.decision)
    if (assessment.decision === 'confirm' && 'confirmationReasons' in vector.expected) expect(assessment.confirmationReasons).toEqual(vector.expected.confirmationReasons)
    if (assessment.decision === 'reject' && 'rejectionReason' in vector.expected) expect(assessment.rejectionReason).toBe(vector.expected.rejectionReason)
    if (assessment.decision !== 'reject') {
      const after = applySettlementToBalances(balancesBeforeCandidate, { ...candidate, amountMinor: amount })
      expectBalances(after, vector.expected.balancesAfter)
    }
  })

  test('parses and serializes the complete signed-64 positive range without number conversion', () => {
    expect(parseSettlementAmountMinor('92233720368547758,07')).toBe(INT64_MAX)
    expect(parseSettlementAmountMinor('92233720368547758,08')).toBeNull()
    expect(isCanonicalPositiveMinor('9223372036854775807')).toBe(true)
    expect(isCanonicalPositiveMinor('01')).toBe(false)
    const settlement: Settlement = { id: SETTLEMENT_ID, groupId: GROUP_ID, senderParticipantId: DEBTOR_ID, receiverParticipantId: CREDITOR_ID, amountMinor: INT64_MAX, occurredOn: '2026-09-24', creatorAccessIdentityId: ACTOR_ID }
    expect(restoreSettlement(serializeSettlement(settlement))).toEqual(settlement)
  })

  test('distinguishes normal, confirmable active, and rejected inactive payments', () => {
    expect(assessSettlement(participants[0]!, participants[1]!, 400n, balances)).toEqual({ decision: 'accept', confirmationReasons: [] })
    expect(assessSettlement(participants[1]!, participants[0]!, 200n, balances)).toEqual({ decision: 'confirm', confirmationReasons: ['wrong_direction'] })
    expect(assessSettlement(participants[0]!, participants[1]!, 1200n, balances)).toEqual({ decision: 'confirm', confirmationReasons: ['exceeds_open_amount'] })
    expect(assessSettlement({ ...participants[0]!, status: 'inactive' }, participants[1]!, 1200n, balances)).toMatchObject({ decision: 'reject' })
  })

  test('creates immutable durable mutation snapshots and preserves FIFO through delete', () => {
    const ids = [SETTLEMENT_ID, MUTATION_ID]
    const result = prepareSettlementSave({ group, participants, pendingMutations: [], balancesBeforeCandidate: balances, actorId: ACTOR_ID, draft: { senderParticipantId: DEBTOR_ID, receiverParticipantId: CREDITOR_ID, amount: '4,00', occurredOn: '2026-09-24' }, generateId: () => ids.shift()! })
    expect(result.ok).toBe(true); if (!result.ok) return
    expect(result.group.hasFinancialHistory).toBe(true)
    expect(result.mutation.payload.settlement.amountMinor).toBe('400')
    expect(Object.isFrozen(result.mutation.payload.settlement)).toBe(true)
    const deletion = prepareSettlementDelete(result.settlement, [result.mutation], () => '77777777-7777-4777-8777-777777777777')
    expect([result.mutation, deletion].map(item => [item.type, item.createdOrder])).toEqual([['CreateSettlement', 0], ['DeleteSettlement', 1]])
  })

  test('applies sent and received Settlements to participant Balances', () => {
    const settlement: Settlement = { id: SETTLEMENT_ID, groupId: GROUP_ID, senderParticipantId: DEBTOR_ID, receiverParticipantId: CREDITOR_ID, amountMinor: 400n, occurredOn: '2026-09-24', creatorAccessIdentityId: ACTOR_ID }
    const expense = { id: '77777777-7777-4777-8777-777777777777', groupId: GROUP_ID, description: 'Hotel', amountMinor: 2000, incurredOn: '2026-09-20', payerParticipantId: CREDITOR_ID, creatorAccessIdentityId: ACTOR_ID, splitMethod: 'equal' as const, shares: [{ participantId: DEBTOR_ID, amountMinor: 1000 }, { participantId: CREDITOR_ID, amountMinor: 1000 }] }
    const result = calculateParticipantBalances(GROUP_ID, participants, [expense], [settlement])
    expect(result.map(item => item.balanceAmountMinor)).toEqual([-600n, 600n])
    expect(result[0]?.sentSettlementAmountMinor).toBe(400n)
    expect(result[1]?.receivedSettlementAmountMinor).toBe(400n)
  })
})
