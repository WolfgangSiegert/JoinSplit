import { describe, expect, test } from 'vitest'
import fixture from '../../../docs/architecture/fixtures/settlement-proposal-vectors.json'
import {
  proposeDeterministicSettlements,
  type SettlementProposalParticipant,
} from '../../app/domain/settlement-proposal'

interface FixtureExpectedSuccess {
  readonly status: 'success'
  readonly transfers: ReadonlyArray<{
    readonly senderParticipantId: string
    readonly receiverParticipantId: string
    readonly amountMinor: string
  }>
}

interface FixtureExpectedInvalid {
  readonly status: 'invalid'
  readonly error: string
}

interface FixtureVector {
  readonly name: string
  readonly participants: readonly SettlementProposalParticipant[]
  readonly expected: {
    readonly deterministic: FixtureExpectedSuccess | FixtureExpectedInvalid
  }
}

const vectors = fixture.vectors as readonly FixtureVector[]

describe('deterministic Settlement Proposal domain', () => {
  test.each(vectors)('matches shared proposal vector: $name', vector => {
    expect(proposeDeterministicSettlements(vector.participants)).toEqual(vector.expected.deterministic)
    expect(proposeDeterministicSettlements([...vector.participants].reverse())).toEqual(vector.expected.deterministic)
  })

  test('ignores input order and does not mutate input', () => {
    const participants: SettlementProposalParticipant[] = [
      { participantId: 'creditor-b', participantOrder: 4, status: 'inactive', balanceAmountMinor: '600' },
      { participantId: 'debtor-b', participantOrder: 2, status: 'active', balanceAmountMinor: '-400' },
      { participantId: 'creditor-a', participantOrder: 3, status: 'active', balanceAmountMinor: '400' },
      { participantId: 'debtor-a', participantOrder: 1, status: 'active', balanceAmountMinor: '-600' },
    ]
    const snapshot = structuredClone(participants)

    expect(proposeDeterministicSettlements(participants)).toEqual({
      status: 'success',
      transfers: [
        { senderParticipantId: 'debtor-a', receiverParticipantId: 'creditor-a', amountMinor: '400' },
        { senderParticipantId: 'debtor-a', receiverParticipantId: 'creditor-b', amountMinor: '200' },
        { senderParticipantId: 'debtor-b', receiverParticipantId: 'creditor-b', amountMinor: '400' },
      ],
    })
    expect(participants).toEqual(snapshot)
  })

  test.each([
    ['invalid participant', [null], 'invalid_participant'],
    ['array-shaped participant', [[]], 'invalid_participant'],
    ['ASCII-whitespace-only ID', [{ participantId: '\t\n\v\f\r ', participantOrder: 0, status: 'active', balanceAmountMinor: '0' }], 'invalid_participant_id'],
    ['duplicate ID', [
      { participantId: 'same', participantOrder: 0, status: 'active', balanceAmountMinor: '-1' },
      { participantId: 'same', participantOrder: 1, status: 'active', balanceAmountMinor: '1' },
    ], 'duplicate_participant_id'],
    ['negative order', [{ participantId: 'alice', participantOrder: -1, status: 'active', balanceAmountMinor: '0' }], 'invalid_participant_order'],
    ['order above the safe-integer maximum', [{ participantId: 'alice', participantOrder: Number.MAX_SAFE_INTEGER + 1, status: 'active', balanceAmountMinor: '0' }], 'invalid_participant_order'],
    ['unknown status', [{ participantId: 'alice', participantOrder: 0, status: 'paused', balanceAmountMinor: '0' }], 'invalid_participant_status'],
    ['non-canonical balance', [{ participantId: 'alice', participantOrder: 0, status: 'active', balanceAmountMinor: '01' }], 'invalid_balance_amount'],
  ] as const)('returns a stable validation result for %s', (_name, participants, error) => {
    expect(proposeDeterministicSettlements(participants as unknown as SettlementProposalParticipant[])).toEqual({ status: 'invalid', error })
  })

  test('accepts the maximum safe participant order and treats NBSP as a nonblank ID character', () => {
    expect(proposeDeterministicSettlements([
      { participantId: '\u00A0', participantOrder: Number.MAX_SAFE_INTEGER, status: 'active', balanceAmountMinor: '0' },
    ])).toEqual({ status: 'success', transfers: [] })
  })

  test('distinguishes invalid deterministic input from exact-strategy unavailability', () => {
    const overExactLimit = vectors.find(vector => vector.name === 'exact strategy is unavailable above twelve non-zero balances')

    expect(overExactLimit).toBeDefined()
    expect(proposeDeterministicSettlements(overExactLimit!.participants)).toEqual(overExactLimit!.expected.deterministic)
  })

  test('uses canonical validation precedence independently of request order', () => {
    const malformed = [
      { participantId: 'valid', participantOrder: 2, status: 'paused', balanceAmountMinor: '0' },
      { participantId: ' ', participantOrder: 1, status: 'active', balanceAmountMinor: '0' },
    ] as unknown as SettlementProposalParticipant[]

    expect(proposeDeterministicSettlements(malformed)).toEqual({ status: 'invalid', error: 'invalid_participant_id' })
    expect(proposeDeterministicSettlements([...malformed].reverse())).toEqual({ status: 'invalid', error: 'invalid_participant_id' })
  })
})
