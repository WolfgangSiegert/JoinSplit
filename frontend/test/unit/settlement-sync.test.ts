import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { PendingCreateSettlement, PendingDeleteSettlement, PendingUpdateSettlement } from '../../app/domain/pending-mutation'
import { restoreSettlement } from '../../app/domain/settlement'
import { synchronizeSettlementMutation } from '../../app/services/settlement-sync'
import { useGroupsStore } from '../../app/stores/groups'

const snapshot = { id: '11111111-1111-4111-8111-111111111111', groupId: '22222222-2222-4222-8222-222222222222', senderParticipantId: '33333333-3333-4333-8333-333333333333', receiverParticipantId: '44444444-4444-4444-8444-444444444444', amountMinor: '9223372036854775807', occurredOn: '2026-09-24', creatorAccessIdentityId: '55555555-5555-4555-8555-555555555555' } as const
const mutation: PendingCreateSettlement = { id: '66666666-6666-4666-8666-666666666666', type: 'CreateSettlement', groupId: snapshot.groupId, createdOrder: 0, payload: { settlement: snapshot } }
const updatedSnapshot = { ...snapshot, amountMinor: '400' } as const
const updateMutation: PendingUpdateSettlement = { id: '77777777-7777-4777-8777-777777777777', type: 'UpdateSettlement', groupId: snapshot.groupId, createdOrder: 1, payload: { settlement: updatedSnapshot } }
const deleteMutation: PendingDeleteSettlement = { id: '88888888-8888-4888-8888-888888888888', type: 'DeleteSettlement', groupId: snapshot.groupId, createdOrder: 2, payload: { settlement: updatedSnapshot } }

function hydrate(mutations: Array<PendingCreateSettlement | PendingUpdateSettlement | PendingDeleteSettlement>, withSettlement = false) {
  const store = useGroupsStore()
  store.hydrate({ groups: [], participants: [], expenses: [], settlements: withSettlement ? [restoreSettlement(updatedSnapshot)] : [], pendingMutations: mutations })
  return store
}

const identity = { accessIdentityId: snapshot.creatorAccessIdentityId, credential: 'secret' }

beforeEach(() => setActivePinia(createPinia()))

describe('Settlement synchronization', () => {
  test('sends the durable amount string unchanged and acknowledges a matching create', async () => {
    const store = hydrate([mutation])
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).amountMinor).toBe(snapshot.amountMinor)
      return new Response(JSON.stringify({ data: snapshot }), { status: 201 })
    })
    const acknowledge = vi.fn(async () => {})
    const result = await synchronizeSettlementMutation({ mutationId: mutation.id, apiBase: 'https://example.test', identity, groupsStore: store, online: true, fetcher, acknowledge })
    expect(result).toEqual({ outcome: 'synced', status: 201 })
    expect(store.pendingMutations).toEqual([])
    expect(acknowledge).toHaveBeenCalledWith(mutation.id)
  })

  test('accepts idempotent create 200, update 200, and delete 204 with exact methods and bodies', async () => {
    for (const [pending, status, expectedMethod] of [[mutation, 200, 'POST'], [updateMutation, 200, 'PUT'], [deleteMutation, 204, 'DELETE']] as const) {
      setActivePinia(createPinia())
      const store = hydrate([pending], pending.type !== 'DeleteSettlement')
      const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe(expectedMethod)
        if (pending.type === 'DeleteSettlement') {
          expect(init?.body).toBeUndefined()
          return new Response(null, { status })
        }
        const request = JSON.parse(String(init?.body))
        expect(request.amountMinor).toBe(pending.payload.settlement.amountMinor)
        expect(Object.keys(request).sort()).toEqual((pending.type === 'CreateSettlement'
          ? ['settlementId', 'senderParticipantId', 'receiverParticipantId', 'amountMinor', 'occurredOn']
          : ['senderParticipantId', 'receiverParticipantId', 'amountMinor', 'occurredOn']).sort())
        return new Response(JSON.stringify({ data: pending.payload.settlement }), { status })
      })
      const result = await synchronizeSettlementMutation({ mutationId: pending.id, apiBase: 'https://example.test/', identity, groupsStore: store, online: true, fetcher, acknowledge: vi.fn(async () => {}) })
      expect(result).toEqual({ outcome: 'synced', status })
    }
  })

  test.each([
    ['malformed response', { data: { ...snapshot, amountMinor: 400 } }],
    ['mismatched response', { data: { ...snapshot, amountMinor: '401' } }],
  ])('keeps the mutation on %s', async (_name, responseBody) => {
    const store = hydrate([mutation])
    const result = await synchronizeSettlementMutation({ mutationId: mutation.id, apiBase: 'https://example.test', identity, groupsStore: store, online: true, fetcher: vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 201 })), acknowledge: vi.fn(async () => {}) })
    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'reconciliation', retryable: false } })
    expect(store.pendingMutations).toEqual([mutation])
  })

  test('keeps the mutation and reports persistence failure when acknowledgement storage fails', async () => {
    const store = hydrate([mutation])
    const result = await synchronizeSettlementMutation({ mutationId: mutation.id, apiBase: 'https://example.test', identity, groupsStore: store, online: true, fetcher: vi.fn(async () => new Response(JSON.stringify({ data: snapshot }), { status: 201 })), acknowledge: vi.fn(async () => { throw new Error('disk') }) })
    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'persistence', retryable: true } })
    expect(store.pendingMutations).toEqual([mutation])
  })

  test('enforces the Group FIFO and never overwrites a newer local Settlement on acknowledgement', async () => {
    const store = hydrate([mutation, updateMutation], true)
    const updateAttempt = await synchronizeSettlementMutation({ mutationId: updateMutation.id, apiBase: 'https://example.test', identity, groupsStore: store, online: true, fetcher: vi.fn(), acknowledge: vi.fn(async () => {}) })
    expect(updateAttempt).toEqual({ outcome: 'busy' })
    const result = await synchronizeSettlementMutation({ mutationId: mutation.id, apiBase: 'https://example.test', identity, groupsStore: store, online: true, fetcher: vi.fn(async () => new Response(JSON.stringify({ data: snapshot }), { status: 201 })), acknowledge: vi.fn(async () => {}) })
    expect(result).toEqual({ outcome: 'synced', status: 201 })
    expect(store.pendingMutations).toEqual([updateMutation])
    expect(store.settlements[0]?.amountMinor).toBe(400n)
  })
})
