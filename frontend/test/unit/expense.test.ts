import { describe, expect, test } from 'vitest'
import { reactive } from 'vue'
import fixture from '../../../docs/architecture/fixtures/equal-split-vectors.json'
import type { Group, Participant } from '../../app/domain/create-group'
import {
  calculateEqualShares,
  isCalendarDate,
  localToday,
  parseAmountMinor,
  participantHasFinancialReferences,
  prepareExpenseDelete,
  prepareExpenseSave,
  validateExpenseDraft,
  type Expense,
} from '../../app/domain/expense'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const EXPENSE_ID = '33333333-3333-4333-8333-333333333333'
const MUTATION_ID = '44444444-4444-4444-8444-444444444444'
const IDS = {
  A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  C: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  D: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const
const participants: Participant[] = fixture.participantOrder.map((key, order) => ({
  id: IDS[key as keyof typeof IDS], groupId: GROUP_ID, name: key, status: 'active', order,
}))
const group: Group = {
  id: GROUP_ID, name: 'Reise', currency: 'EUR', ownerAccessIdentityId: ACTOR_ID,
  status: 'active', hasFinancialHistory: false, participantIds: participants.map(item => item.id),
}

describe('Expense domain', () => {
  test.each(fixture.vectors)('matches shared Equal Split vector $name', vector => {
    expect(calculateEqualShares(
      vector.amountMinor,
      vector.selectedParticipantIds.map(id => IDS[id as keyof typeof IDS]),
      participants,
    )).toEqual(vector.expectedShares.map(share => ({
      participantId: IDS[share.participantId as keyof typeof IDS], amountMinor: share.amountMinor,
    })))
  })

  test.each([
    ['10', 1000], ['10,5', 1050], ['10,50', 1050], ['10.50', 1050],
    ['90071992547409,91', Number.MAX_SAFE_INTEGER],
  ])('parses %s without floating-point conversion', (input, expected) => {
    expect(parseAmountMinor(input)).toBe(expected)
  })

  test.each(['', '0', '-1', '+1', '1.', '1,', '1,234', '1.234', '1 000', '1e2', '90071992547409,92'])('rejects invalid money %s', input => {
    expect(parseAmountMinor(input)).toBeNull()
  })

  test('validates real calendar dates and uses the local calendar date', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true)
    expect(isCalendarDate('2027-02-29')).toBe(false)
    expect(localToday(new Date(2026, 8, 3, 23, 30))).toBe('2026-09-03')
  })

  test('normalizes a 200-codepoint description and rejects the next codepoint', () => {
    const accepted = validateExpenseDraft({
      description: `  ${'😀'.repeat(200)}  `, amount: '1', incurredOn: '2026-09-23',
      payerParticipantId: participants[0]!.id, participantIds: [participants[0]!.id],
    }, participants)
    expect(accepted.errors).toEqual({})
    expect(Array.from(accepted.normalizedDescription)).toHaveLength(200)
    expect(validateExpenseDraft({
      description: '😀'.repeat(201), amount: '1', incurredOn: '2026-09-23',
      payerParticipantId: participants[0]!.id, participantIds: [participants[0]!.id],
    }, participants).errors.description).toBeDefined()
  })

  test('creates an immutable full snapshot, sets financial history, and permits payer outside shares', () => {
    const ids = [EXPENSE_ID, MUTATION_ID]
    const result = prepareExpenseSave({
      group: reactive(group), participants, pendingMutations: [], actorId: ACTOR_ID,
      draft: { description: '  Dinner  ', amount: '0,01', incurredOn: '2026-09-24', payerParticipantId: participants[3]!.id, participantIds: [participants[2]!.id, participants[0]!.id, participants[1]!.id] },
      generateId: () => ids.shift()!,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.group.hasFinancialHistory).toBe(true)
    expect(result.group.participantIds).not.toBe(group.participantIds)
    expect(() => structuredClone(result.group)).not.toThrow()
    expect(result.expense).toMatchObject({ id: EXPENSE_ID, description: 'Dinner', amountMinor: 1, payerParticipantId: participants[3]!.id })
    expect(result.expense.shares.map(share => share.amountMinor)).toEqual([1, 0, 0])
    expect(result.mutation.payload.expense).toEqual(result.expense)
    expect(Object.isFrozen(result.mutation.payload.expense)).toBe(true)
    expect(Object.isFrozen(result.mutation.payload.expense.shares)).toBe(true)
  })

  test('allows existing inactive references to remain or be removed but never newly selected', () => {
    const inactive = { ...participants[2]!, status: 'inactive' as const }
    const available = [participants[0]!, inactive]
    const existing: Expense = {
      id: EXPENSE_ID, groupId: GROUP_ID, description: 'Alt', amountMinor: 100,
      incurredOn: '2026-09-20', payerParticipantId: inactive.id, creatorAccessIdentityId: ACTOR_ID,
      splitMethod: 'equal', shares: [{ participantId: inactive.id, amountMinor: 100 }],
    }
    const preserved = validateExpenseDraft({ description: 'Alt', amount: '1', incurredOn: '2026-09-20', payerParticipantId: inactive.id, participantIds: [inactive.id] }, available, existing)
    expect(preserved.errors).toEqual({})
    const removed = validateExpenseDraft({ description: 'Alt', amount: '1', incurredOn: '2026-09-20', payerParticipantId: participants[0]!.id, participantIds: [participants[0]!.id] }, available, existing)
    expect(removed.errors).toEqual({})
    const introduced = validateExpenseDraft({ description: 'Neu', amount: '1', incurredOn: '2026-09-20', payerParticipantId: inactive.id, participantIds: [inactive.id] }, available)
    expect(introduced.errors).toMatchObject({ payerParticipantId: expect.any(String), participantIds: expect.any(String) })
  })

  test('keeps Create, Update, Delete snapshots in global order without compaction', () => {
    const createIds = [EXPENSE_ID, MUTATION_ID]
    const created = prepareExpenseSave({ group, participants, pendingMutations: [], actorId: ACTOR_ID,
      draft: { description: 'A', amount: '1', incurredOn: '2026-09-23', payerParticipantId: participants[0]!.id, participantIds: [participants[0]!.id] }, generateId: () => createIds.shift()! })
    expect(created.ok).toBe(true); if (!created.ok) return
    const updated = prepareExpenseSave({ group: created.group, participants, pendingMutations: [created.mutation], actorId: ACTOR_ID, existing: created.expense,
      draft: { description: 'B', amount: '2', incurredOn: '2026-09-24', payerParticipantId: participants[1]!.id, participantIds: [participants[1]!.id] }, generateId: () => '55555555-5555-4555-8555-555555555555' })
    expect(updated.ok).toBe(true); if (!updated.ok) return
    const deleted = prepareExpenseDelete(reactive(updated.expense), [created.mutation, updated.mutation], () => '66666666-6666-4666-8666-666666666666')
    expect([created.mutation, updated.mutation, deleted].map(item => [item.type, item.createdOrder])).toEqual([
      ['CreateExpense', 0], ['UpdateExpense', 1], ['DeleteExpense', 2],
    ])
    expect(created.mutation.payload.expense.description).toBe('A')
    expect(updated.mutation.payload.expense.description).toBe('B')
    expect(deleted.payload.expense.description).toBe('B')
    expect(() => structuredClone(deleted.payload.expense)).not.toThrow()
  })

  test('keeps AddParticipant, CreateExpense, DeleteExpense, DeleteParticipant in one Group FIFO', () => {
    const added = participants[0]!
    const addMutation = {
      id: MUTATION_ID, type: 'AddParticipant' as const, groupId: GROUP_ID, createdOrder: 0,
      payload: { participantId: added.id, name: added.name, order: added.order },
    }
    const createIds = [EXPENSE_ID, '55555555-5555-4555-8555-555555555555']
    const created = prepareExpenseSave({
      group, participants, pendingMutations: [addMutation], actorId: ACTOR_ID,
      draft: { description: 'A', amount: '1', incurredOn: '2026-09-23', payerParticipantId: added.id, participantIds: [added.id] },
      generateId: () => createIds.shift()!,
    })
    expect(created.ok).toBe(true); if (!created.ok) return
    const deleted = prepareExpenseDelete(created.expense, [addMutation, created.mutation], () => '66666666-6666-4666-8666-666666666666')
    const deleteParticipant = {
      id: '77777777-7777-4777-8777-777777777777', type: 'DeleteParticipant' as const,
      groupId: GROUP_ID, createdOrder: 3, payload: { participantId: added.id },
    }
    expect([addMutation, created.mutation, deleted, deleteParticipant].map(item => [item.type, item.createdOrder])).toEqual([
      ['AddParticipant', 0], ['CreateExpense', 1], ['DeleteExpense', 2], ['DeleteParticipant', 3],
    ])
  })

  test('blocks Participant hard deletion for payer and share references', () => {
    const expense: Expense = { id: EXPENSE_ID, groupId: GROUP_ID, description: 'A', amountMinor: 1, incurredOn: '2026-09-23', payerParticipantId: participants[0]!.id, creatorAccessIdentityId: ACTOR_ID, splitMethod: 'equal', shares: [{ participantId: participants[1]!.id, amountMinor: 1 }] }
    expect(participantHasFinancialReferences(participants[0]!.id, [expense])).toBe(true)
    expect(participantHasFinancialReferences(participants[1]!.id, [expense])).toBe(true)
    expect(participantHasFinancialReferences(participants[2]!.id, [expense])).toBe(false)
  })
})
