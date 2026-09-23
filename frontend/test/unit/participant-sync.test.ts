import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Participant } from '../../app/domain/create-group'
import type { PendingDeactivateParticipant, PendingRenameParticipant } from '../../app/domain/pending-mutation'
import { synchronizeParticipantMutation } from '../../app/services/participant-sync'
import { useGroupsStore } from '../../app/stores/groups'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const MUTATION_ID = '33333333-3333-4333-8333-333333333333'
const identity = { accessIdentityId: '44444444-4444-4444-8444-444444444444', credential: 'secret' }

function renameMutation(): PendingRenameParticipant {
  return { id: MUTATION_ID, type: 'RenameParticipant', groupId: GROUP_ID, createdOrder: 0,
    payload: { participantId: PARTICIPANT_ID, name: 'Alice Neu', active: true, order: 3 } }
}

function deactivateMutation(): PendingDeactivateParticipant {
  return { id: MUTATION_ID, type: 'DeactivateParticipant', groupId: GROUP_ID, createdOrder: 0,
    payload: { participantId: PARTICIPANT_ID, name: 'Alice', active: false, order: 3 } }
}

function responseParticipant(overrides: Record<string, unknown> = {}) {
  return { id: PARTICIPANT_ID, groupId: GROUP_ID, name: 'Alice Neu', active: true, order: 3, ...overrides }
}

function setup(mutation: PendingRenameParticipant | PendingDeactivateParticipant) {
  const groupsStore = useGroupsStore()
  const participant: Participant = { id: PARTICIPANT_ID, groupId: GROUP_ID, name: mutation.payload.name,
    status: mutation.payload.active ? 'active' : 'inactive', order: mutation.payload.order }
  groupsStore.hydrate({ groups: [], participants: [participant], pendingMutations: [mutation] })
  return groupsStore
}

async function synchronize(
  mutation: PendingRenameParticipant | PendingDeactivateParticipant,
  body: Record<string, unknown>,
  acknowledge = vi.fn(async () => {}),
) {
  const groupsStore = setup(mutation)
  let requestInit: RequestInit | undefined
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestInit = init
    return new Response(JSON.stringify({ data: body }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  })
  const result = await synchronizeParticipantMutation({ mutationId: MUTATION_ID, apiBase: 'https://example.test',
    identity, groupsStore, online: true, fetcher, acknowledge })
  return { result, groupsStore, fetcher, acknowledge, requestInit }
}

beforeEach(() => setActivePinia(createPinia()))

describe('Participant synchronization reconciliation', () => {
  test('reconciles a complete Rename response while sending only the name', async () => {
    const { result, groupsStore, requestInit, acknowledge } = await synchronize(renameMutation(), responseParticipant())
    expect(result).toEqual({ outcome: 'synced', status: 200 })
    expect(JSON.parse(String(requestInit?.body))).toEqual({ name: 'Alice Neu' })
    expect(acknowledge).toHaveBeenCalledWith(MUTATION_ID)
    expect(groupsStore.pendingMutations).toEqual([])
  })

  test.each([
    ['active', { active: false }],
    ['order', { order: 4 }],
  ])('retains Rename after a %s mismatch and exposes a safe failure', async (_field, mismatch) => {
    const { result, groupsStore, acknowledge } = await synchronize(renameMutation(), responseParticipant(mismatch))
    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'reconciliation' } })
    expect(groupsStore.pendingMutations).toHaveLength(1)
    expect(groupsStore.mutationSync[MUTATION_ID]).toMatchObject({ state: 'failed', error: { kind: 'reconciliation' } })
    expect(acknowledge).not.toHaveBeenCalled()
  })

  test('reconciles a complete Deactivate response while sending only active=false', async () => {
    const body = responseParticipant({ name: 'Alice', active: false })
    const { result, groupsStore, requestInit } = await synchronize(deactivateMutation(), body)
    expect(result).toEqual({ outcome: 'synced', status: 200 })
    expect(JSON.parse(String(requestInit?.body))).toEqual({ active: false })
    expect(groupsStore.pendingMutations).toEqual([])
  })

  test.each([
    ['name', { name: 'Andere Person', active: false }],
    ['order', { name: 'Alice', active: false, order: 4 }],
  ])('retains Deactivate after a %s mismatch', async (_field, mismatch) => {
    const { result, groupsStore, acknowledge } = await synchronize(deactivateMutation(), responseParticipant(mismatch))
    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'reconciliation' } })
    expect(groupsStore.pendingMutations).toHaveLength(1)
    expect(acknowledge).not.toHaveBeenCalled()
  })

  test('retains a reconciled mutation when durable acknowledgment fails', async () => {
    const acknowledge = vi.fn(async () => { throw new Error('write failed') })
    const { result, groupsStore } = await synchronize(renameMutation(), responseParticipant(), acknowledge)
    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'persistence', retryable: true } })
    expect(groupsStore.pendingMutations).toHaveLength(1)
    expect(groupsStore.mutationSync[MUTATION_ID]).toMatchObject({ state: 'failed', error: { kind: 'persistence' } })
  })
})
