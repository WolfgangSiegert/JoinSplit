import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useApplicationLifecycleStore } from '../../app/stores/application-lifecycle'
import { useAccessIdentityStore } from '../../app/stores/access-identity'
import { useGroupsStore, type PendingCreateGroupMutation } from '../../app/stores/groups'
import { useSettingsStore } from '../../app/stores/settings'
import { validateDurableState } from '../../app/persistence/validation'
import type { DurableState } from '../../app/persistence/database'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const SECOND_PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const CREDENTIAL = '0123456789abcdef'.repeat(4)

const pendingMutation: PendingCreateGroupMutation = {
  kind: 'CreateGroup',
  status: 'pending',
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
    accessIdentity: { id: ACTOR_ID, credential: CREDENTIAL },
    groups: [{
      id: GROUP_ID,
      name: 'Wochenende',
      currency: 'EUR',
      ownerAccessIdentityId: ACTOR_ID,
      status: 'active',
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
    settings: { addSelfAsParticipantByDefault: false },
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
    expect(persistIdentity).not.toHaveBeenCalled()
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
      accessIdentity: { id: ACTOR_ID, credential: 'not-a-credential' },
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

  test('rejects Participant order that disagrees with the Group participantIds order', () => {
    const value = durableState({
      participants: [{
        ...durableState().participants[0]!,
        order: 1,
      }],
      pendingMutations: [],
    })

    expect(() => validateDurableState(value)).toThrow(
      'Persisted group participant ordering is inconsistent',
    )
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
})
