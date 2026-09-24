import { describe, expect, test } from 'vitest'
import fixture from '../../../docs/architecture/fixtures/balance-vectors.json'
import type { Participant } from '../../app/domain/create-group'
import type { Expense } from '../../app/domain/expense'
import {
  calculateParticipantBalances,
  formatSignedAmountMinor,
} from '../../app/domain/balance'

function participantsFor(
  participants: (typeof fixture.vectors)[number]['participants'],
): Participant[] {
  return participants.map(participant => ({
    ...participant,
    status: participant.status as Participant['status'],
  }))
}

function expensesFor(expenses: (typeof fixture.vectors)[number]['expenses']): Expense[] {
  return expenses.map(expense => ({
    ...expense,
    description: expense.id,
    incurredOn: '2026-09-24',
    creatorAccessIdentityId: 'actor-1',
    splitMethod: 'equal',
  }))
}

describe('Participant Balance domain', () => {
  test.each(fixture.vectors)('matches shared Balance vector: $name', vector => {
    const result = calculateParticipantBalances(
      fixture.groupId,
      participantsFor(vector.participants),
      expensesFor(vector.expenses),
    )

    expect(result).toEqual(vector.expected.map(expected => ({
      participantId: expected.participantId,
      paidAmountMinor: BigInt(expected.paidAmountMinor),
      shareAmountMinor: BigInt(expected.shareAmountMinor),
      balanceAmountMinor: BigInt(expected.balanceAmountMinor),
    })))
  })

  test('does not mutate inputs and ignores Expense and Share input order', () => {
    const vector = fixture.vectors[3]!
    const participants = participantsFor(vector.participants).reverse()
    const expenses = expensesFor(vector.expenses).reverse().map(expense => ({
      ...expense,
      shares: [...expense.shares].reverse(),
    }))
    const participantSnapshot = structuredClone(participants)
    const expenseSnapshot = structuredClone(expenses)

    const result = calculateParticipantBalances(fixture.groupId, participants, expenses)

    expect(participants).toEqual(participantSnapshot)
    expect(expenses).toEqual(expenseSnapshot)
    expect(result.map(balance => balance.participantId)).toEqual(['alice', 'bob', 'cara'])
  })

  test.each([
    ['missing Group ID', '', [], [], 'Group ID'],
    ['duplicate Participant ID', 'group-1', [
      { id: 'alice', groupId: 'group-1', name: 'Alice', status: 'active', order: 1 },
      { id: 'alice', groupId: 'group-1', name: 'Alice 2', status: 'active', order: 2 },
    ], [], 'Participant IDs'],
    ['Participant from another Group', 'group-1', [
      { id: 'alice', groupId: 'group-2', name: 'Alice', status: 'active', order: 1 },
    ], [], 'requested Group'],
    ['duplicate Participant order', 'group-1', [
      { id: 'alice', groupId: 'group-1', name: 'Alice', status: 'active', order: 1 },
      { id: 'bob', groupId: 'group-1', name: 'Bob', status: 'active', order: 1 },
    ], [], 'order values'],
  ] as const)('rejects %s', (_name, groupId, participants, expenses, message) => {
    expect(() => calculateParticipantBalances(
      groupId,
      participants as readonly Participant[],
      expenses as readonly Expense[],
    )).toThrow(message)
  })

  test('rejects inconsistent Expenses and Shares', () => {
    const participants: Participant[] = [
      { id: 'alice', groupId: 'group-1', name: 'Alice', status: 'active', order: 1 },
      { id: 'bob', groupId: 'group-1', name: 'Bob', status: 'active', order: 2 },
    ]
    const valid: Expense = {
      id: 'expense-1', groupId: 'group-1', description: 'Dinner', amountMinor: 100,
      incurredOn: '2026-09-24', payerParticipantId: 'alice', creatorAccessIdentityId: 'actor-1',
      splitMethod: 'equal', shares: [{ participantId: 'bob', amountMinor: 100 }],
    }
    const calculate = (expense: Expense) => calculateParticipantBalances('group-1', participants, [expense])

    expect(() => calculate({ ...valid, groupId: 'group-2' })).toThrow('requested Group')
    expect(() => calculate({ ...valid, amountMinor: 0 })).toThrow('Expense amount')
    expect(() => calculate({ ...valid, payerParticipantId: 'unknown' })).toThrow('payer')
    expect(() => calculate({ ...valid, shares: [] })).toThrow('at least one Share')
    expect(() => calculate({ ...valid, shares: [{ participantId: 'unknown', amountMinor: 100 }] })).toThrow('supplied Participant')
    expect(() => calculate({ ...valid, shares: [
      { participantId: 'bob', amountMinor: 50 },
      { participantId: 'bob', amountMinor: 50 },
    ] })).toThrow('unique per Expense')
    expect(() => calculate({ ...valid, shares: [{ participantId: 'bob', amountMinor: -1 }] })).toThrow('Share amount')
    expect(() => calculate({ ...valid, shares: [{ participantId: 'bob', amountMinor: 99 }] })).toThrow('sum exactly')
    expect(() => calculateParticipantBalances('group-1', participants, [valid, { ...valid }])).toThrow('Expense IDs')
  })

  test('formats signed EUR amounts exactly without number conversion', () => {
    expect(formatSignedAmountMinor(600n)).toBe('+6,00 €')
    expect(formatSignedAmountMinor(-400n)).toBe('−4,00 €')
    expect(formatSignedAmountMinor(0n)).toBe('0,00 €')
    expect(formatSignedAmountMinor(18014398509481982n)).toBe('+180143985094819,82 €')
  })
})
