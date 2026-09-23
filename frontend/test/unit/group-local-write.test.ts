import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { serializeGroupLocalWrite } from '../../app/composables/group-local-write'
import { useParticipants } from '../../app/composables/use-participants'
import type { Group } from '../../app/domain/create-group'
import { useGroupsStore } from '../../app/stores/groups'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const group: Group = {
  id: GROUP_ID,
  name: 'Reise',
  currency: 'EUR',
  ownerAccessIdentityId: ACTOR_ID,
  status: 'active',
  hasFinancialHistory: false,
  participantIds: [],
}

beforeEach(() => setActivePinia(createPinia()))

describe('Group-local writes', () => {
  test('prepares simultaneous Participant additions from the latest committed same-Group state', async () => {
    const store = useGroupsStore()
    store.hydrate({ groups: [group], participants: [], expenses: [], pendingMutations: [] })
    let releaseFirst!: () => void
    const firstWrite = new Promise<void>(resolve => { releaseFirst = resolve })
    const persistAdd = vi.fn(async () => {
      if (persistAdd.mock.calls.length === 1) await firstWrite
    })
    const { add } = useParticipants({
      persistAdd,
      persistDelete: vi.fn(async () => undefined),
      persistUpdate: vi.fn(async () => undefined),
    })

    const alice = add(GROUP_ID, 'Alice')
    const bob = add(GROUP_ID, 'Bob')
    await vi.waitFor(() => expect(persistAdd).toHaveBeenCalledTimes(1))
    expect(store.participants).toEqual([])

    releaseFirst()
    await expect(Promise.all([alice, bob])).resolves.toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ])

    expect(persistAdd).toHaveBeenCalledTimes(2)
    expect(store.pendingMutations.map(item => item.createdOrder)).toEqual([0, 1])
    expect(store.participants.map(item => [item.name, item.order])).toEqual([['Alice', 0], ['Bob', 1]])
    expect(store.findGroup(GROUP_ID)?.participantIds).toEqual(store.participants.map(item => item.id))
  })

  test('does not make an unrelated Group wait for a blocked write', async () => {
    const storeScope = {}
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const first = serializeGroupLocalWrite(storeScope, GROUP_ID, [], async createdOrder => { await blocked; return createdOrder })
    const other = serializeGroupLocalWrite(storeScope, '33333333-3333-4333-8333-333333333333', [], async createdOrder => createdOrder)

    await expect(other).resolves.toBe(1)
    release()
    await expect(first).resolves.toBe(0)
  })

  test('propagates a write failure without poisoning the same-Group queue', async () => {
    const storeScope = {}
    const failed = serializeGroupLocalWrite(storeScope, GROUP_ID, [], async () => { throw new Error('disk') })
    const following = serializeGroupLocalWrite(storeScope, GROUP_ID, [], async () => 'committed')

    await expect(failed).rejects.toThrow('disk')
    await expect(following).resolves.toBe('committed')
  })
})
