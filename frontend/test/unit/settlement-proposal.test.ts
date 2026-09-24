import { describe, expect, test } from 'vitest'
import fixture from '../../../docs/architecture/fixtures/settlement-proposal-vectors.json'
import {
  proposeDeterministicSettlements,
  proposeMinimumTransferSettlements,
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

interface FixtureExpectedUnavailable {
  readonly status: 'unavailable'
  readonly reason: 'non_zero_participant_limit'
  readonly nonZeroParticipantCount: number
  readonly limit: 12
}

interface FixtureVector {
  readonly name: string
  readonly participants: readonly SettlementProposalParticipant[]
  readonly expected: {
    readonly deterministic: FixtureExpectedSuccess | FixtureExpectedInvalid
    readonly minimumTransfer: FixtureExpectedSuccess | FixtureExpectedInvalid | FixtureExpectedUnavailable
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

describe('minimum-transfer Settlement Proposal domain', () => {
  test.each(vectors)('matches shared proposal vector: $name', vector => {
    expect(proposeMinimumTransferSettlements(vector.participants)).toEqual(vector.expected.minimumTransfer)
    expect(proposeMinimumTransferSettlements([...vector.participants].reverse())).toEqual(vector.expected.minimumTransfer)
  })

  test('ignores request order and does not mutate input', () => {
    const participants: SettlementProposalParticipant[] = [
      { participantId: 'creditor-b', participantOrder: 4, status: 'inactive', balanceAmountMinor: '600' },
      { participantId: 'debtor-b', participantOrder: 2, status: 'active', balanceAmountMinor: '-400' },
      { participantId: 'creditor-a', participantOrder: 3, status: 'active', balanceAmountMinor: '400' },
      { participantId: 'debtor-a', participantOrder: 1, status: 'active', balanceAmountMinor: '-600' },
    ]
    const snapshot = structuredClone(participants)

    expect(proposeMinimumTransferSettlements(participants)).toEqual({
      status: 'success',
      transfers: [
        { senderParticipantId: 'debtor-a', receiverParticipantId: 'creditor-b', amountMinor: '600' },
        { senderParticipantId: 'debtor-b', receiverParticipantId: 'creditor-a', amountMinor: '400' },
      ],
    })
    expect(participants).toEqual(snapshot)
  })

  test.each([
    ['invalid participant', [null]],
    ['array-shaped participant', [[]]],
    ['blank ID', [{ participantId: ' ', participantOrder: 0, status: 'active', balanceAmountMinor: '0' }]],
    ['invalid order', [{ participantId: 'alice', participantOrder: -1, status: 'active', balanceAmountMinor: '0' }]],
    ['invalid status', [{ participantId: 'alice', participantOrder: 0, status: 'paused', balanceAmountMinor: '0' }]],
    ['invalid amount', [{ participantId: 'alice', participantOrder: 0, status: 'active', balanceAmountMinor: '+0' }]],
  ] as const)('preserves deterministic validation semantics for %s', (_name, participants) => {
    const input = participants as unknown as SettlementProposalParticipant[]
    expect(proposeMinimumTransferSettlements(input)).toEqual(proposeDeterministicSettlements(input))
  })

  test('applies the final proposal tie-break rather than subset enumeration order', () => {
    const participants: SettlementProposalParticipant[] = [
      { participantId: 'd1', participantOrder: 1, status: 'active', balanceAmountMinor: '-4' },
      { participantId: 'd2', participantOrder: 2, status: 'active', balanceAmountMinor: '-1' },
      { participantId: 'd3', participantOrder: 3, status: 'active', balanceAmountMinor: '-1' },
      { participantId: 'c1', participantOrder: 4, status: 'active', balanceAmountMinor: '1' },
      { participantId: 'c2', participantOrder: 5, status: 'active', balanceAmountMinor: '2' },
      { participantId: 'c3', participantOrder: 6, status: 'active', balanceAmountMinor: '3' },
    ]

    expect(proposeMinimumTransferSettlements(participants)).toEqual({
      status: 'success',
      transfers: [
        { senderParticipantId: 'd1', receiverParticipantId: 'c1', amountMinor: '1' },
        { senderParticipantId: 'd1', receiverParticipantId: 'c3', amountMinor: '3' },
        { senderParticipantId: 'd2', receiverParticipantId: 'c2', amountMinor: '1' },
        { senderParticipantId: 'd3', receiverParticipantId: 'c2', amountMinor: '1' },
      ],
    })
  })

  test('finds the independently verified minimum count for exhaustive small balanced inputs', () => {
    for (let first = -2; first <= 2; first += 1) {
      for (let second = -2; second <= 2; second += 1) {
        for (let third = -2; third <= 2; third += 1) {
          const balances = [first, second, third, -(first + second + third)].filter(balance => balance !== 0)
          if (balances.length === 0 || !balances.some(balance => balance < 0) || !balances.some(balance => balance > 0)) continue
          const participants = balances.map((balance, index) => ({
            participantId: `p${index}`,
            participantOrder: index,
            status: 'active' as const,
            balanceAmountMinor: balance.toString(10),
          }))
          const result = proposeMinimumTransferSettlements(participants)

          expect(result.status).toBe('success')
          if (result.status === 'success') {
            expect(result.transfers).toHaveLength(balances.length - maximumZeroSumBlockCount(balances))
          }
        }
      }
    }
  })

  test('completes the twelve-participant exponential boundary', { timeout: 10_000 }, () => {
    const boundary = vectors.find(vector => vector.name === 'exact strategy succeeds at twelve non-zero balances')

    expect(boundary).toBeDefined()
    expect(proposeMinimumTransferSettlements(boundary!.participants)).toEqual(boundary!.expected.minimumTransfer)
  })
})

function maximumZeroSumBlockCount(balances: readonly number[]): number {
  const fullMask = (1 << balances.length) - 1
  const best = new Uint8Array(fullMask + 1)

  for (let mask = 1; mask <= fullMask; mask += 1) {
    const anchor = mask & -mask
    for (let subset = mask; subset > 0; subset = (subset - 1) & mask) {
      if ((subset & anchor) === 0) continue
      const sum = balances.reduce((total, balance, index) => total + ((subset & (1 << index)) === 0 ? 0 : balance), 0)
      if (sum === 0) best[mask] = Math.max(best[mask]!, best[mask ^ subset]! + 1)
    }
  }

  return best[fullMask]!
}
