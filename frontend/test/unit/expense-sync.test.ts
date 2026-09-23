import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Expense } from '../../app/domain/expense'
import type { PendingCreateExpense, PendingDeleteExpense, PendingUpdateExpense } from '../../app/domain/pending-mutation'
import { synchronizeExpenseMutation } from '../../app/services/expense-sync'
import { useGroupsStore } from '../../app/stores/groups'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const EXPENSE_ID = '33333333-3333-4333-8333-333333333333'
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444'
const MUTATION_IDS = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777']
const identity = { accessIdentityId: ACTOR_ID, credential: 'secret' }
const expense: Expense = { id: EXPENSE_ID, groupId: GROUP_ID, description: 'Dinner', amountMinor: 1001, incurredOn: '2026-09-23', payerParticipantId: PARTICIPANT_ID, creatorAccessIdentityId: ACTOR_ID, splitMethod: 'equal', shares: [{ participantId: PARTICIPANT_ID, amountMinor: 1001 }] }

function mutation(type: 'CreateExpense' | 'UpdateExpense' | 'DeleteExpense', createdOrder: number) {
  return { id: MUTATION_IDS[createdOrder]!, type, groupId: GROUP_ID, createdOrder, payload: { expense: { ...expense, description: `${expense.description}${createdOrder}` } } } as PendingCreateExpense | PendingUpdateExpense | PendingDeleteExpense
}

beforeEach(() => setActivePinia(createPinia()))

describe('Expense synchronization', () => {
  test('maps exact Create and Update payloads from immutable snapshots', async () => {
    for (const type of ['CreateExpense', 'UpdateExpense'] as const) {
      setActivePinia(createPinia())
      const pending = mutation(type, 0)
      const store = useGroupsStore(); store.hydrate({ groups: [], participants: [], expenses: [pending.payload.expense], pendingMutations: [pending] })
      let input = ''; let init: RequestInit | undefined
      const fetcher = vi.fn(async (request: RequestInfo | URL, options?: RequestInit) => {
        input = String(request); init = options
        return new Response(JSON.stringify({ data: pending.payload.expense }), { status: type === 'CreateExpense' ? 201 : 200 })
      })
      const result = await synchronizeExpenseMutation({ mutationId: pending.id, apiBase: 'https://example.test/', identity, groupsStore: store, online: true, fetcher, acknowledge: vi.fn(async () => {}) })
      expect(result.outcome).toBe('synced')
      expect(init?.method).toBe(type === 'CreateExpense' ? 'POST' : 'PUT')
      expect(input).toBe(type === 'CreateExpense' ? `https://example.test/api/groups/${GROUP_ID}/expenses` : `https://example.test/api/groups/${GROUP_ID}/expenses/${EXPENSE_ID}`)
      expect(JSON.parse(String(init?.body))).toEqual(type === 'CreateExpense'
        ? { expenseId: EXPENSE_ID, description: 'Dinner0', amountMinor: 1001, incurredOn: '2026-09-23', payerParticipantId: PARTICIPANT_ID, participantIds: [PARTICIPANT_ID] }
        : { description: 'Dinner0', amountMinor: 1001, incurredOn: '2026-09-23', payerParticipantId: PARTICIPANT_ID, participantIds: [PARTICIPANT_ID] })
    }
  })

  test('accepts an identical Create retry with 200 but rejects Update with 201', async () => {
    const create = mutation('CreateExpense', 0)
    const createStore = useGroupsStore()
    createStore.hydrate({ groups: [], participants: [], expenses: [create.payload.expense], pendingMutations: [create] })
    const retry = vi.fn(async () => new Response(JSON.stringify({ data: create.payload.expense }), { status: 200 }))
    await expect(synchronizeExpenseMutation({ mutationId: create.id, apiBase: '', identity, groupsStore: createStore, online: true, fetcher: retry, acknowledge: vi.fn(async () => {}) }))
      .resolves.toEqual({ outcome: 'synced', status: 200 })

    setActivePinia(createPinia())
    const update = mutation('UpdateExpense', 0)
    const updateStore = useGroupsStore()
    updateStore.hydrate({ groups: [], participants: [], expenses: [update.payload.expense], pendingMutations: [update] })
    const wrongStatus = vi.fn(async () => new Response(JSON.stringify({ data: update.payload.expense }), { status: 201 }))
    await expect(synchronizeExpenseMutation({ mutationId: update.id, apiBase: '', identity, groupsStore: updateStore, online: true, fetcher: wrongStatus, acknowledge: vi.fn(async () => {}) }))
      .resolves.toMatchObject({ outcome: 'failed', error: { kind: 'unexpected' } })
    expect(updateStore.pendingMutations).toHaveLength(1)
  })

  test('sends idempotent Delete without a body', async () => {
    const pending = mutation('DeleteExpense', 0)
    const store = useGroupsStore(); store.hydrate({ groups: [], participants: [], expenses: [], pendingMutations: [pending] })
    const fetcher = vi.fn(async (_request: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({ method: 'DELETE' }); expect(init?.body).toBeUndefined()
      return new Response(null, { status: 204 })
    })
    await expect(synchronizeExpenseMutation({ mutationId: pending.id, apiBase: '', identity, groupsStore: store, online: true, fetcher, acknowledge: vi.fn(async () => {}) })).resolves.toEqual({ outcome: 'synced', status: 204 })
  })

  test('enforces same-Group FIFO across all mutation kinds', async () => {
    const create = mutation('CreateExpense', 0); const update = mutation('UpdateExpense', 1)
    const store = useGroupsStore(); store.hydrate({ groups: [], participants: [], expenses: [update.payload.expense], pendingMutations: [create, update] })
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: update.payload.expense }), { status: 200 }))
    expect(await synchronizeExpenseMutation({ mutationId: update.id, apiBase: '', identity, groupsStore: store, online: true, fetcher, acknowledge: vi.fn(async () => {}) })).toEqual({ outcome: 'busy' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('acknowledging an older snapshot removes only that mutation and never overwrites newer runtime state', async () => {
    const create = mutation('CreateExpense', 0); const update = mutation('UpdateExpense', 1)
    const store = useGroupsStore(); store.hydrate({ groups: [], participants: [], expenses: [update.payload.expense], pendingMutations: [create, update] })
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: create.payload.expense }), { status: 201 }))
    await synchronizeExpenseMutation({ mutationId: create.id, apiBase: '', identity, groupsStore: store, online: true, fetcher, acknowledge: vi.fn(async () => {}) })
    expect(store.expenses).toEqual([update.payload.expense])
    expect(store.pendingMutations.map(item => item.id)).toEqual([update.id])
  })

  test('retains the snapshot after reconciliation or durable acknowledgement failure', async () => {
    const pending = mutation('CreateExpense', 0)
    const store = useGroupsStore(); store.hydrate({ groups: [], participants: [], expenses: [pending.payload.expense], pendingMutations: [pending] })
    const mismatch = vi.fn(async () => new Response(JSON.stringify({ data: { ...pending.payload.expense, amountMinor: 999 } }), { status: 201 }))
    expect(await synchronizeExpenseMutation({ mutationId: pending.id, apiBase: '', identity, groupsStore: store, online: true, fetcher: mismatch, acknowledge: vi.fn(async () => {}) })).toMatchObject({ outcome: 'failed', error: { kind: 'reconciliation' } })
    expect(store.pendingMutations).toHaveLength(1)

    store.mutationSync[pending.id] = { state: 'pending', error: null }
    const match = vi.fn(async () => new Response(JSON.stringify({ data: pending.payload.expense }), { status: 201 }))
    expect(await synchronizeExpenseMutation({ mutationId: pending.id, apiBase: '', identity, groupsStore: store, online: true, fetcher: match, acknowledge: vi.fn(async () => { throw new Error('disk') }) })).toMatchObject({ outcome: 'failed', error: { kind: 'persistence' } })
    expect(store.pendingMutations).toHaveLength(1)
  })
})
