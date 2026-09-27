import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Participant } from '../../app/domain/create-group'
import type { PendingAddParticipant, PendingAssociateParticipant, PendingDeactivateParticipant, PendingReactivateParticipant, PendingRenameParticipant } from '../../app/domain/pending-mutation'
import { synchronizeParticipantMutation } from '../../app/services/participant-sync'
import { useGroupsStore } from '../../app/stores/groups'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const MUTATION_ID = '33333333-3333-4333-8333-333333333333'
const PERSON_ID = '55555555-5555-4555-8555-555555555555'
const identity = { accessIdentityId: '44444444-4444-4444-8444-444444444444', credential: 'secret' }

function renameMutation(): PendingRenameParticipant {
  return { id: MUTATION_ID, type: 'RenameParticipant', groupId: GROUP_ID, createdOrder: 0,
    payload: { participantId: PARTICIPANT_ID, name: 'Alice Neu', active: true, order: 3 } }
}

function deactivateMutation(): PendingDeactivateParticipant {
  return { id: MUTATION_ID, type: 'DeactivateParticipant', groupId: GROUP_ID, createdOrder: 0,
    payload: { participantId: PARTICIPANT_ID, name: 'Alice', active: false, order: 3 } }
}

function reactivateMutation(): PendingReactivateParticipant {
  return { id: MUTATION_ID, type: 'ReactivateParticipant', groupId: GROUP_ID, createdOrder: 0,
    payload: { participantId: PARTICIPANT_ID, name: 'Alice', active: true, order: 3 } }
}

function responseParticipant(overrides: Record<string, unknown> = {}) {
  return { id: PARTICIPANT_ID, groupId: GROUP_ID, name: 'Alice Neu', active: true, order: 3, ...overrides }
}

function setup(mutation: PendingRenameParticipant | PendingDeactivateParticipant | PendingReactivateParticipant) {
  const groupsStore = useGroupsStore()
  const participant: Participant = { id: PARTICIPANT_ID, groupId: GROUP_ID, name: mutation.payload.name,
    status: mutation.payload.active ? 'active' : 'inactive', order: mutation.payload.order }
  groupsStore.hydrate({ groups: [], participants: [participant], pendingMutations: [mutation] })
  return groupsStore
}

async function synchronize(
  mutation: PendingRenameParticipant | PendingDeactivateParticipant | PendingReactivateParticipant,
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
  test.each([
    ['Account', { accessIdentityId: identity.accessIdentityId, credential: null }, true],
    ['anonymous', identity, false],
  ])('sends a Person association only in %s mode', async (_mode, currentIdentity, accountMode) => {
    const mutation: PendingAddParticipant = {
      id: MUTATION_ID, type: 'AddParticipant', groupId: GROUP_ID, createdOrder: 0,
      payload: { participantId: PARTICIPANT_ID, personId: PERSON_ID, name: 'Ada', order: 0 },
    }
    const groupsStore = useGroupsStore()
    groupsStore.hydrate({
      groups: [{ id: GROUP_ID, name: 'Group', currency: 'EUR', ownerAccessIdentityId: identity.accessIdentityId,
        status: 'active', hasFinancialHistory: false, participantIds: [PARTICIPANT_ID] }],
      participants: [{ id: PARTICIPANT_ID, groupId: GROUP_ID, personId: PERSON_ID, name: 'Ada', status: 'active', order: 0 }],
      pendingMutations: [mutation], groupRevisions: { [GROUP_ID]: 0 },
    })
    const mutationBodies: Record<string, unknown>[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/account/csrf')) {
        return new Response(JSON.stringify({ data: { csrfToken: 'csrf-token' } }), { status: 200 })
      }
      mutationBodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ data: {
        id: PARTICIPANT_ID, groupId: GROUP_ID, ...(accountMode ? { personId: PERSON_ID } : {}),
        name: 'Ada', active: true, order: 0,
      } }), { status: 201, headers: accountMode ? { 'X-Group-Revision': '1' } : {} })
    })

    const result = await synchronizeParticipantMutation({
      mutationId: MUTATION_ID, apiBase: 'https://example.test', identity: currentIdentity,
      groupsStore, online: true, fetcher, acknowledge: vi.fn(async () => {}),
    })

    expect(result).toEqual({ outcome: 'synced', status: 201 })
    expect(mutationBodies).toEqual([accountMode
      ? { participantId: PARTICIPANT_ID, personId: PERSON_ID, name: 'Ada', order: 0 }
      : { participantId: PARTICIPANT_ID, name: 'Ada', order: 0 }])
  })

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

  test('reconciles a complete Reactivate response while sending only active=true', async () => {
    const body = responseParticipant({ name: 'Alice', active: true })
    const { result, groupsStore, requestInit } = await synchronize(reactivateMutation(), body)
    expect(result).toEqual({ outcome: 'synced', status: 200 })
    expect(JSON.parse(String(requestInit?.body))).toEqual({ active: true })
    expect(groupsStore.pendingMutations).toEqual([])
  })

  test.each([
    ['link', PERSON_ID, { personId: PERSON_ID }],
    ['unlink', null, {}],
  ])('reconciles an explicit Account %s association', async (_operation, personId, responseAssociation) => {
    const mutation: PendingAssociateParticipant = {
      id: MUTATION_ID, type: 'AssociateParticipant', groupId: GROUP_ID, createdOrder: 0,
      payload: { participantId: PARTICIPANT_ID, personId, name: 'Alice', active: true, order: 3 },
    }
    const groupsStore = useGroupsStore()
    groupsStore.hydrate({
      groups: [{ id: GROUP_ID, name: 'Group', currency: 'EUR', ownerAccessIdentityId: identity.accessIdentityId,
        status: 'active', hasFinancialHistory: false, participantIds: [PARTICIPANT_ID] }],
      participants: [{ id: PARTICIPANT_ID, groupId: GROUP_ID, ...(personId ? { personId } : {}), name: 'Alice', status: 'active', order: 3 }],
      pendingMutations: [mutation], groupRevisions: { [GROUP_ID]: 4 },
    })
    const bodies: Record<string, unknown>[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/account/csrf')) {
        return new Response(JSON.stringify({ data: { csrfToken: 'csrf' } }), { status: 200 })
      }
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ data: {
        id: PARTICIPANT_ID, groupId: GROUP_ID, name: 'Alice', active: true, order: 3, ...responseAssociation,
      } }), { status: 200, headers: { 'X-Group-Revision': '5' } })
    })

    const result = await synchronizeParticipantMutation({
      mutationId: MUTATION_ID, apiBase: 'https://example.test',
      identity: { accessIdentityId: identity.accessIdentityId, credential: null }, groupsStore,
      online: true, fetcher, acknowledge: vi.fn(async () => {}),
    })

    expect(result).toEqual({ outcome: 'synced', status: 200 })
    expect(bodies).toEqual([{ personId }])
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
