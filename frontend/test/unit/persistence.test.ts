import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useApplicationLifecycleStore } from '../../app/stores/application-lifecycle'
import { useAccessIdentityStore } from '../../app/stores/access-identity'
import { useGroupsStore, type PendingCreateGroupMutation } from '../../app/stores/groups'
import { useSettingsStore } from '../../app/stores/settings'
import { validateDurableState } from '../../app/persistence/validation'
import type { DurableState } from '../../app/persistence/database'
import type { PendingMutation } from '../../app/domain/pending-mutation'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const SECOND_PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const CREDENTIAL = '0123456789abcdef'.repeat(4)

const pendingMutation: PendingCreateGroupMutation = {
  id: '55555555-5555-4555-8555-555555555555',
  type: 'CreateGroup',
  groupId: GROUP_ID,
  createdOrder: 0,
  payload: {
    groupId: GROUP_ID,
    name: 'Wochenende',
    currency: 'EUR',
    actorId: ACTOR_ID,
    initialParticipant: { participantId: PARTICIPANT_ID, name: 'Wolfgang' },
  },
}

function durableState(overrides: Partial<DurableState> = {}): DurableState {
  return {
    accessIdentity: { id: ACTOR_ID, credential: CREDENTIAL, synchronizationStatus: 'registered' },
    groups: [{
      id: GROUP_ID,
      name: 'Wochenende',
      currency: 'EUR',
      ownerAccessIdentityId: ACTOR_ID,
      status: 'active',
      hasFinancialHistory: false,
      participantIds: [PARTICIPANT_ID],
    }],
    participants: [{
      id: PARTICIPANT_ID,
      groupId: GROUP_ID,
      name: 'Wolfgang',
      status: 'active',
      order: 0,
    }],
    pendingMutations: [pendingMutation],
    expenses: [],
    settlements: [],
    settings: {
      addSelfAsParticipantByDefault: false,
      settlementProposalStrategy: 'deterministic',
      colorMode: 'dark',
      visualDesign: '3',
    },
    ...overrides,
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('durable state validation and bootstrap', () => {
  test('hydrates identity, domain state, pending runtime state, and settings', async () => {
    const persistIdentity = vi.fn(async () => {})
    await useApplicationLifecycleStore().initialize({
      load: vi.fn(async () => durableState()),
      persistIdentity,
    })

    expect(useApplicationLifecycleStore().state).toBe('ready')
    expect(useAccessIdentityStore().accessIdentityId).toBe(ACTOR_ID)
    expect(useAccessIdentityStore().credential).toBe(CREDENTIAL)
    expect(useGroupsStore().groups[0]?.id).toBe(GROUP_ID)
    expect(useGroupsStore().participants[0]?.id).toBe(PARTICIPANT_ID)
    expect(useGroupsStore().createGroupSync[GROUP_ID]).toEqual({ state: 'pending', error: null })
    expect(useSettingsStore().addSelfAsParticipantByDefault).toBe(false)
    expect(useSettingsStore().settlementProposalStrategy).toBe('deterministic')
    expect(useSettingsStore().colorMode).toBe('dark')
    expect(useSettingsStore().visualDesign).toBe('3')
    expect(persistIdentity).not.toHaveBeenCalled()
  })

  test('validates durable Settlement strings and hydrates runtime bigint values', async () => {
    const settlement = {
      id: '66666666-6666-4666-8666-666666666666', groupId: GROUP_ID,
      senderParticipantId: PARTICIPANT_ID, receiverParticipantId: SECOND_PARTICIPANT_ID,
      amountMinor: '9223372036854775807', occurredOn: '2026-09-24', creatorAccessIdentityId: ACTOR_ID,
    }
    const state = durableState({
      groups: [{ ...durableState().groups[0]!, hasFinancialHistory: true, participantIds: [PARTICIPANT_ID, SECOND_PARTICIPANT_ID] }],
      participants: [durableState().participants[0]!, { id: SECOND_PARTICIPANT_ID, groupId: GROUP_ID, name: 'Ada', status: 'active', order: 1 }],
      pendingMutations: [], settlements: [settlement],
    })
    expect(validateDurableState(state)).toBe(state)
    await useApplicationLifecycleStore().initialize({ load: vi.fn(async () => state), persistIdentity: vi.fn(async () => {}) })
    expect(useGroupsStore().settlements[0]?.amountMinor).toBe(9223372036854775807n)
    expect(() => validateDurableState({ ...state, settlements: [{ ...settlement, amountMinor: '01' }] })).toThrow()
  })

  test('accepts a Settlement tombstone before a later Participant deletion in the same FIFO', () => {
    const settlement = { id: '66666666-6666-4666-8666-666666666666', groupId: GROUP_ID, senderParticipantId: PARTICIPANT_ID, receiverParticipantId: SECOND_PARTICIPANT_ID, amountMinor: '400', occurredOn: '2026-09-24', creatorAccessIdentityId: ACTOR_ID }
    const value = durableState({
      groups: [{ ...durableState().groups[0]!, hasFinancialHistory: true, participantIds: [SECOND_PARTICIPANT_ID] }],
      participants: [{ id: SECOND_PARTICIPANT_ID, groupId: GROUP_ID, name: 'Ada', status: 'active', order: 1 }],
      settlements: [],
      pendingMutations: [
        { id: '77777777-7777-4777-8777-777777777777', type: 'DeleteSettlement', groupId: GROUP_ID, createdOrder: 0, payload: { settlement } },
        { id: '88888888-8888-4888-8888-888888888888', type: 'DeleteParticipant', groupId: GROUP_ID, createdOrder: 1, payload: { participantId: PARTICIPANT_ID } },
      ],
    })
    expect(validateDurableState(value)).toBe(value)
  })

  test('rejects Settlement mutation snapshots with wrong ownership or impossible Participant order', () => {
    const settlement = { id: '66666666-6666-4666-8666-666666666666', groupId: GROUP_ID, senderParticipantId: PARTICIPANT_ID, receiverParticipantId: SECOND_PARTICIPANT_ID, amountMinor: '400', occurredOn: '2026-09-24', creatorAccessIdentityId: ACTOR_ID }
    const base = durableState({
      groups: [{ ...durableState().groups[0]!, hasFinancialHistory: true, participantIds: [SECOND_PARTICIPANT_ID] }],
      participants: [{ id: SECOND_PARTICIPANT_ID, groupId: GROUP_ID, name: 'Ada', status: 'active', order: 1 }], settlements: [],
    })
    expect(() => validateDurableState({ ...base, pendingMutations: [{ id: '77777777-7777-4777-8777-777777777777', type: 'DeleteSettlement', groupId: GROUP_ID, createdOrder: 0, payload: { settlement: { ...settlement, creatorAccessIdentityId: SECOND_PARTICIPANT_ID } } }] })).toThrow('ownership')
    expect(() => validateDurableState({ ...base, pendingMutations: [
      { id: '88888888-8888-4888-8888-888888888888', type: 'DeleteParticipant', groupId: GROUP_ID, createdOrder: 0, payload: { participantId: PARTICIPANT_ID } },
      { id: '77777777-7777-4777-8777-777777777777', type: 'DeleteSettlement', groupId: GROUP_ID, createdOrder: 1, payload: { settlement } },
    ] })).toThrow('Participant mismatch')
  })

  test('reconstructs and freezes every known mutation level after rehydration', async () => {
    await useApplicationLifecycleStore().initialize({
      load: vi.fn(async () => durableState()),
      persistIdentity: vi.fn(async () => {}),
    })

    const mutation = useGroupsStore().pendingMutations[0]!
    expect(Object.isFrozen(mutation)).toBe(true)
    expect(Object.isFrozen(mutation.payload)).toBe(true)
    expect(mutation.type).toBe('CreateGroup')
    if (mutation.type !== 'CreateGroup' || !mutation.payload.initialParticipant) return
    expect(Object.isFrozen(mutation.payload.initialParticipant)).toBe(true)
    expect(Reflect.set(mutation, 'createdOrder', 99)).toBe(false)
    expect(Reflect.set(mutation.payload, 'name', 'Manipuliert')).toBe(false)
    expect(Reflect.set(mutation.payload.initialParticipant, 'name', 'Manipuliert')).toBe(false)
    expect(mutation.payload.name).toBe('Wochenende')
    expect(mutation.payload.initialParticipant.name).toBe('Wolfgang')
  })

  test('persists one new identity before making a fresh installation ready', async () => {
    const persisted: Array<{ id: string; credential: string }> = []
    await useApplicationLifecycleStore().initialize({
      load: vi.fn(async () => durableState({
        accessIdentity: null,
        groups: [],
        participants: [],
        pendingMutations: [],
        settings: null,
      })),
      persistIdentity: vi.fn(async identity => { persisted.push(identity) }),
    })

    expect(persisted).toHaveLength(1)
    expect(useApplicationLifecycleStore().state).toBe('ready')
    expect(useAccessIdentityStore().accessIdentityId).toBe(persisted[0]?.id)
    expect(useAccessIdentityStore().credential).toBe(persisted[0]?.credential)
  })

  test('fails safely without hydrating malformed persisted state', async () => {
    const malformed = durableState({
      accessIdentity: { id: ACTOR_ID, credential: 'not-a-credential', synchronizationStatus: 'registered' },
    })
    await useApplicationLifecycleStore().initialize({
      load: vi.fn(async () => malformed),
      persistIdentity: vi.fn(async () => {}),
    })

    expect(useApplicationLifecycleStore().state).toBe('failed')
    expect(useAccessIdentityStore().accessIdentityId).toBeNull()
    expect(useGroupsStore().groups).toEqual([])
  })

  test('rejects a pending payload that no longer matches its durable group', () => {
    const value = durableState({
      pendingMutations: [{
        ...pendingMutation,
        payload: { ...pendingMutation.payload, name: 'Manipuliert' },
      }],
    })

    expect(() => validateDurableState(value)).toThrow()
  })

  test('rejects a Group and Participant that share the same identifier', () => {
    const value = durableState({
      groups: [{
        ...durableState().groups[0]!,
        id: PARTICIPANT_ID,
      }],
      participants: [{
        ...durableState().participants[0]!,
        groupId: PARTICIPANT_ID,
      }],
      pendingMutations: [],
    })

    expect(() => validateDurableState(value)).toThrow(
      'Persisted group and participant identifiers collide',
    )
  })

  test('accepts a stable Participant order with historical gaps', () => {
    const value = durableState({
      participants: [{
        ...durableState().participants[0]!,
        order: 1,
      }],
      pendingMutations: [],
    })

    expect(validateDurableState(value)).toBe(value)
  })

  test('accepts a valid stable Participant order', () => {
    const value = durableState({
      groups: [{
        ...durableState().groups[0]!,
        participantIds: [PARTICIPANT_ID, SECOND_PARTICIPANT_ID],
      }],
      participants: [
        durableState().participants[0]!,
        {
          id: SECOND_PARTICIPANT_ID,
          groupId: GROUP_ID,
          name: 'Ada',
          status: 'active',
          order: 1,
        },
      ],
      pendingMutations: [],
    })

    expect(validateDurableState(value)).toBe(value)
  })

  test('rejects a pending RenameParticipant whose expected name differs from local state', () => {
    const rename: PendingMutation = {
      id: '66666666-6666-4666-8666-666666666666', type: 'RenameParticipant', groupId: GROUP_ID, createdOrder: 1,
      payload: { participantId: PARTICIPANT_ID, name: 'Alice', active: true, order: 0 },
    }
    expect(() => validateDurableState(durableState({ pendingMutations: [rename] })))
      .toThrow('Persisted RenameParticipant local state mismatch')
  })

  test('rejects a pending DeactivateParticipant while local state is still active', () => {
    const deactivate: PendingMutation = {
      id: '66666666-6666-4666-8666-666666666666', type: 'DeactivateParticipant', groupId: GROUP_ID, createdOrder: 1,
      payload: { participantId: PARTICIPANT_ID, name: 'Wolfgang', active: false, order: 0 },
    }
    expect(() => validateDurableState(durableState({ pendingMutations: [deactivate] })))
      .toThrow('Persisted DeactivateParticipant local state mismatch')
  })

  test('accepts an AddParticipant followed by RenameParticipant when local state matches the rename', () => {
    const chain: PendingMutation[] = [{
      id: '66666666-6666-4666-8666-666666666666', type: 'AddParticipant', groupId: GROUP_ID, createdOrder: 0,
      payload: { participantId: PARTICIPANT_ID, name: 'Alice', order: 0 },
    }, {
      id: '77777777-7777-4777-8777-777777777777', type: 'RenameParticipant', groupId: GROUP_ID, createdOrder: 1,
      payload: { participantId: PARTICIPANT_ID, name: 'Wolfgang', active: true, order: 0 },
    }]
    const value = durableState({ pendingMutations: chain })
    expect(validateDurableState(value)).toBe(value)
  })

  test('accepts a pending DeleteParticipant with the Participant already absent locally', () => {
    const deletion: PendingMutation = {
      id: '66666666-6666-4666-8666-666666666666', type: 'DeleteParticipant', groupId: GROUP_ID, createdOrder: 0,
      payload: { participantId: PARTICIPANT_ID },
    }
    const value = durableState({
      groups: [{ ...durableState().groups[0]!, participantIds: [] }],
      participants: [], pendingMutations: [deletion],
    })
    expect(validateDurableState(value)).toBe(value)
  })
})
