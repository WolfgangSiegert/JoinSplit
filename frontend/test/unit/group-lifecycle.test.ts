import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useGroupLifecycle } from '../../app/composables/use-group-lifecycle'
import type { Group, Participant } from '../../app/domain/create-group'
import { prepareGroupArchive, prepareGroupDelete, prepareGroupReactivation } from '../../app/domain/group-lifecycle'
import type { PendingArchiveGroup, PendingDeleteGroup } from '../../app/domain/pending-mutation'
import { validateDurableState } from '../../app/persistence/validation'
import { synchronizeGroupLifecycleMutation } from '../../app/services/group-lifecycle-sync'
import { useGroupsStore } from '../../app/stores/groups'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333'
const MUTATION_ID = '44444444-4444-4444-8444-444444444444'
const group: Group = { id: GROUP_ID, name: 'Reise', currency: 'EUR', ownerAccessIdentityId: ACTOR_ID, status: 'active', hasFinancialHistory: false, participantIds: [PARTICIPANT_ID] }
const participant: Participant = { id: PARTICIPANT_ID, groupId: GROUP_ID, name: 'Ada', status: 'active', order: 0 }
const identity = { accessIdentityId: ACTOR_ID, credential: 'secret' }

beforeEach(() => setActivePinia(createPinia()))

describe('Group lifecycle', () => {
  test('prepares deterministic FIFO status mutations and requires financial history for archive', () => {
    expect(() => prepareGroupArchive(group, { createdOrder: 3, generateId: () => MUTATION_ID })).toThrow('financial history')
    const archived = prepareGroupArchive({ ...group, hasFinancialHistory: true }, { createdOrder: 3, generateId: () => MUTATION_ID })
    expect(archived.group.status).toBe('archived')
    expect(archived.mutation).toEqual({ id: MUTATION_ID, type: 'ArchiveGroup', groupId: GROUP_ID, createdOrder: 3, payload: { status: 'archived' } })
    expect(Object.isFrozen(archived.mutation)).toBe(true)
    const reactivated = prepareGroupReactivation(archived.group, { createdOrder: 4, generateId: () => MUTATION_ID })
    expect(reactivated.group.status).toBe('active')
    expect(reactivated.mutation.type).toBe('ReactivateGroup')
  })

  test('hard delete rejects history, records, or any prior Group mutation', () => {
    const options = { createdOrder: 1, generateId: () => MUTATION_ID }
    expect(() => prepareGroupDelete({ ...group, hasFinancialHistory: true }, [], false, options)).toThrow('without financial history')
    expect(() => prepareGroupDelete(group, [], true, options)).toThrow('without financial history')
    const archive: PendingArchiveGroup = { id: MUTATION_ID, type: 'ArchiveGroup', groupId: GROUP_ID, createdOrder: 0, payload: { status: 'archived' } }
    expect(() => prepareGroupDelete(group, [archive], false, options)).toThrow('synchronization must finish')
    expect(prepareGroupDelete(group, [], false, options)).toEqual({ id: MUTATION_ID, type: 'DeleteGroup', groupId: GROUP_ID, createdOrder: 1, payload: {} })
  })

  test('does not expose a lifecycle change when its durable transaction fails', async () => {
    const store = useGroupsStore()
    store.hydrate({ groups: [{ ...group, hasFinancialHistory: true }], participants: [participant], pendingMutations: [] })
    const { archive, remove } = useGroupLifecycle({
      persistStatus: vi.fn(async () => { throw new Error('disk') }),
      persistDeleteRequest: vi.fn(async () => { throw new Error('disk') }),
    })
    await expect(archive(GROUP_ID)).rejects.toThrow('disk')
    expect(store.findGroup(GROUP_ID)?.status).toBe('active')
    expect(store.pendingMutations).toEqual([])

    store.hydrate({ groups: [group], participants: [participant], pendingMutations: [] })
    await expect(remove(GROUP_ID)).rejects.toThrow('disk')
    expect(store.findGroup(GROUP_ID)).toEqual(group)
    expect(store.pendingMutations).toEqual([])
  })

  test('rehydration accepts the retained DeleteGroup tombstone and hides it from normal lookup', () => {
    const deletion: PendingDeleteGroup = { id: MUTATION_ID, type: 'DeleteGroup', groupId: GROUP_ID, createdOrder: 0, payload: {} }
    const state = { accessIdentity: { id: ACTOR_ID, credential: '01'.repeat(32), synchronizationStatus: 'registered' as const }, groups: [group], participants: [participant], pendingMutations: [deletion], expenses: [], settlements: [], settings: null }
    expect(validateDurableState(state)).toBe(state)
    const store = useGroupsStore(); store.hydrate(state)
    expect(store.findGroup(GROUP_ID)).toBeUndefined()
    expect(store.findStoredGroup(GROUP_ID)).toEqual(group)
    expect(store.visibleGroups).toEqual([])
    expect(store.pendingGroupDeletions).toEqual([deletion])
  })

  test('rehydration rejects an ArchiveGroup mutation without irreversible financial history', () => {
    const archive: PendingArchiveGroup = { id: MUTATION_ID, type: 'ArchiveGroup', groupId: GROUP_ID, createdOrder: 0, payload: { status: 'archived' } }
    const invalid = {
      accessIdentity: { id: ACTOR_ID, credential: '01'.repeat(32), synchronizationStatus: 'registered' as const },
      groups: [{ ...group, status: 'archived' as const }], participants: [participant], pendingMutations: [archive],
      expenses: [], settlements: [], settings: null,
    }
    expect(() => validateDurableState(invalid)).toThrow('archive history mismatch')
  })

  test('treats 404 as reconciled only for the pending DeleteGroup and purges after durable acknowledgement', async () => {
    const deletion: PendingDeleteGroup = { id: MUTATION_ID, type: 'DeleteGroup', groupId: GROUP_ID, createdOrder: 0, payload: {} }
    const store = useGroupsStore(); store.hydrate({ groups: [group], participants: [participant], pendingMutations: [deletion] })
    const acknowledgeDelete = vi.fn(async () => undefined)
    const result = await synchronizeGroupLifecycleMutation({ mutationId: MUTATION_ID, apiBase: 'https://example.test', identity, groupsStore: store, online: true, fetcher: vi.fn(async () => new Response(null, { status: 404 })), acknowledgeDelete })
    expect(result).toEqual({ outcome: 'synced', status: 404 })
    expect(acknowledgeDelete).toHaveBeenCalledWith(GROUP_ID, MUTATION_ID)
    expect(store.groups).toEqual([]); expect(store.participants).toEqual([]); expect(store.pendingMutations).toEqual([])

    const archive: PendingArchiveGroup = { id: MUTATION_ID, type: 'ArchiveGroup', groupId: GROUP_ID, createdOrder: 0, payload: { status: 'archived' } }
    const archiveStore = useGroupsStore(); archiveStore.hydrate({ groups: [{ ...group, hasFinancialHistory: true, status: 'archived' }], participants: [participant], pendingMutations: [archive] })
    const archiveResult = await synchronizeGroupLifecycleMutation({ mutationId: MUTATION_ID, apiBase: 'https://example.test', identity, groupsStore: archiveStore, online: true, fetcher: vi.fn(async () => new Response(null, { status: 404 })), acknowledgeStatus: vi.fn(async () => undefined) })
    expect(archiveResult).toMatchObject({ outcome: 'failed', error: { kind: 'unauthorized' } })
    expect(archiveStore.pendingMutations).toEqual([archive])
  })

  test('acknowledges a status change only when the complete lifecycle response matches', async () => {
    const archive: PendingArchiveGroup = { id: MUTATION_ID, type: 'ArchiveGroup', groupId: GROUP_ID, createdOrder: 0, payload: { status: 'archived' } }
    const archivedGroup = { ...group, hasFinancialHistory: true, status: 'archived' as const }
    const store = useGroupsStore(); store.hydrate({ groups: [archivedGroup], participants: [participant], pendingMutations: [archive] })
    const acknowledgeStatus = vi.fn(async () => undefined)
    const matching = await synchronizeGroupLifecycleMutation({
      mutationId: MUTATION_ID, apiBase: 'https://example.test', identity, groupsStore: store, online: true,
      fetcher: vi.fn(async () => new Response(JSON.stringify({ data: { id: GROUP_ID, status: 'archived', hasFinancialHistory: true } }), { status: 200 })),
      acknowledgeStatus,
    })
    expect(matching).toEqual({ outcome: 'synced', status: 200 })
    expect(acknowledgeStatus).toHaveBeenCalledWith(MUTATION_ID)

    const mismatchStore = useGroupsStore(); mismatchStore.hydrate({ groups: [archivedGroup], participants: [participant], pendingMutations: [archive] })
    const mismatching = await synchronizeGroupLifecycleMutation({
      mutationId: MUTATION_ID, apiBase: 'https://example.test', identity, groupsStore: mismatchStore, online: true,
      fetcher: vi.fn(async () => new Response(JSON.stringify({ data: { id: GROUP_ID, status: 'archived', hasFinancialHistory: false } }), { status: 200 })),
      acknowledgeStatus: vi.fn(async () => undefined),
    })
    expect(mismatching).toMatchObject({ outcome: 'failed', error: { kind: 'reconciliation' } })
    expect(mismatchStore.pendingMutations).toEqual([archive])
  })

  test('retains the hidden aggregate and exact mutation when delete acknowledgement persistence fails', async () => {
    const deletion: PendingDeleteGroup = { id: MUTATION_ID, type: 'DeleteGroup', groupId: GROUP_ID, createdOrder: 0, payload: {} }
    const store = useGroupsStore(); store.hydrate({ groups: [group], participants: [participant], pendingMutations: [deletion] })
    const result = await synchronizeGroupLifecycleMutation({ mutationId: MUTATION_ID, apiBase: 'https://example.test', identity, groupsStore: store, online: true, fetcher: vi.fn(async () => new Response(null, { status: 204 })), acknowledgeDelete: vi.fn(async () => { throw new Error('disk') }) })
    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'persistence', retryable: true } })
    expect(store.findStoredGroup(GROUP_ID)).toEqual(group)
    expect(store.findGroup(GROUP_ID)).toBeUndefined()
    expect(store.pendingMutations).toEqual([deletion])
  })
})
