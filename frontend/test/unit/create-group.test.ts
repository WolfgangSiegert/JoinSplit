import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  GROUP_CURRENCY,
  normalizeName,
  prepareGroupCreation,
  type CreateGroupDraft,
} from '../../app/domain/create-group'
import { useCreateGroup } from '../../app/composables/use-create-group'
import { useGroupsStore } from '../../app/stores/groups'
import { useAccessIdentityStore } from '../../app/stores/access-identity'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'

function ids(...values: string[]): () => string {
  let index = 0
  return () => values[index++]!
}

function draft(overrides: Partial<CreateGroupDraft> = {}): CreateGroupDraft {
  return {
    groupName: 'Wochenende',
    addParticipant: true,
    participantName: 'Wolfgang',
    ...overrides,
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('local Create Group workflow', () => {
  test('creates one active EUR group, a separate active participant, and a pending mutation', () => {
    const result = prepareGroupCreation(draft(), ACTOR_ID, ids(GROUP_ID, PARTICIPANT_ID))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const store = useGroupsStore()
    store.commitCreation(result.value)

    expect(store.groups).toEqual([
      expect.objectContaining({
        id: GROUP_ID,
        currency: GROUP_CURRENCY,
        ownerAccessIdentityId: ACTOR_ID,
        status: 'active',
        participantIds: [PARTICIPANT_ID],
      }),
    ])
    expect(store.participants).toEqual([
      expect.objectContaining({
        id: PARTICIPANT_ID,
        groupId: GROUP_ID,
        status: 'active',
        order: 0,
      }),
    ])
    expect(GROUP_ID).not.toBe(PARTICIPANT_ID)
    expect(store.pendingCreateGroups).toHaveLength(1)
  })

  test('uses independent platform UUID v4 identifiers by default', () => {
    const result = prepareGroupCreation(draft(), ACTOR_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    expect(result.value.group.id).toMatch(uuidV4)
    expect(result.value.participant?.id).toMatch(uuidV4)
    expect(result.value.group.id).not.toBe(result.value.participant?.id)
  })

  test('creates a group without a participant when the checkbox is disabled', () => {
    const result = prepareGroupCreation(
      draft({ addParticipant: false, participantName: 'Nicht übernehmen' }),
      ACTOR_ID,
      ids(GROUP_ID),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const store = useGroupsStore()
    store.commitCreation(result.value)

    expect(store.groups[0]?.participantIds).toEqual([])
    expect(store.participants).toEqual([])
    expect(store.pendingCreateGroups[0]?.payload.initialParticipant).toBeNull()
  })

  test('normalizes only approved edge whitespace before persistence', () => {
    const result = prepareGroupCreation(
      draft({ groupName: '\uFEFF\u00A0 Reise 👋 \u3000', participantName: '\u2007 Wölfchen\u202F' }),
      ACTOR_ID,
      ids(GROUP_ID, PARTICIPANT_ID),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.group.name).toBe('Reise 👋')
    expect(result.value.participant?.name).toBe('Wölfchen')
    expect(normalizeName(' innen   bleibt ')).toBe('innen   bleibt')
  })

  test('rejects an invalid group name without creating any local state', async () => {
    const store = useGroupsStore()
    const { createGroup } = useCreateGroup()
    const result = await createGroup(draft({ groupName: '\u3000\u00A0' }))

    expect(result).toEqual({
      ok: false,
      errors: { groupName: 'Gruppenname ist erforderlich.', participantName: undefined },
    })
    expect(store.groups).toEqual([])
    expect(store.participants).toEqual([])
    expect(store.pendingCreateGroups).toEqual([])
  })

  test('rejects a missing required participant name without partial state', async () => {
    const store = useGroupsStore()
    const { createGroup } = useCreateGroup()
    const result = await createGroup(draft({ participantName: '   ' }))

    expect(result).toEqual({
      ok: false,
      errors: { groupName: undefined, participantName: 'Name ist erforderlich.' },
    })
    expect(store.groups).toEqual([])
    expect(store.participants).toEqual([])
    expect(store.pendingCreateGroups).toEqual([])
  })

  test('counts Unicode code points rather than UTF-16 code units at the boundary', () => {
    const oneHundredEmoji = '😀'.repeat(100)
    const accepted = prepareGroupCreation(
      draft({ groupName: oneHundredEmoji, addParticipant: false }),
      ACTOR_ID,
      ids(GROUP_ID),
    )
    const rejected = prepareGroupCreation(
      draft({ groupName: `${oneHundredEmoji}😀`, addParticipant: false }),
      ACTOR_ID,
      ids(GROUP_ID),
    )

    expect(accepted.ok).toBe(true)
    expect(rejected).toEqual({
      ok: false,
      errors: {
        groupName: 'Gruppenname darf höchstens 100 Zeichen lang sein.',
        participantName: undefined,
      },
    })

    const participantAccepted = prepareGroupCreation(
      draft({ participantName: oneHundredEmoji }),
      ACTOR_ID,
      ids(GROUP_ID, PARTICIPANT_ID),
    )
    const participantRejected = prepareGroupCreation(
      draft({ participantName: `${oneHundredEmoji}😀` }),
      ACTOR_ID,
      ids(GROUP_ID, PARTICIPANT_ID),
    )
    expect(participantAccepted.ok).toBe(true)
    expect(participantRejected).toEqual({
      ok: false,
      errors: {
        groupName: undefined,
        participantName: 'Name darf höchstens 100 Zeichen lang sein.',
      },
    })
  })

  test('keeps stable normalized retry data and excludes the credential', () => {
    const mutableDraft = draft({ groupName: '  Reise  ', participantName: '  Wolfgang  ' })
    const result = prepareGroupCreation(mutableDraft, ACTOR_ID, ids(GROUP_ID, PARTICIPANT_ID))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const store = useGroupsStore()
    store.commitCreation(result.value)
    mutableDraft.groupName = 'Später geändert'
    mutableDraft.participantName = 'Andere Person'

    const mutation = store.pendingCreateGroups[0]
    expect(mutation?.payload).toEqual({
      groupId: GROUP_ID,
      name: 'Reise',
      currency: 'EUR',
      actorId: ACTOR_ID,
      initialParticipant: { participantId: PARTICIPANT_ID, name: 'Wolfgang' },
    })
    expect(JSON.stringify(mutation)).not.toContain('credential')
    expect(Object.isFrozen(result.value.payload)).toBe(true)
    expect(Object.isFrozen(result.value.payload.initialParticipant)).toBe(true)
  })

  test('does not duplicate a successfully committed creation', () => {
    const result = prepareGroupCreation(draft(), ACTOR_ID, ids(GROUP_ID, PARTICIPANT_ID))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const store = useGroupsStore()
    store.commitCreation(result.value)
    store.commitCreation(result.value)

    expect(store.groups).toHaveLength(1)
    expect(store.participants).toHaveLength(1)
    expect(store.pendingCreateGroups).toHaveLength(1)
  })

  test('does not expose partial Pinia state when durable creation fails', async () => {
    useAccessIdentityStore().hydrate({ id: ACTOR_ID, credential: '0123456789abcdef'.repeat(4) })
    const store = useGroupsStore()
    const { createGroup } = useCreateGroup({
      persistCreation: vi.fn(async () => { throw new Error('transaction failed') }),
    })

    await expect(createGroup(draft())).rejects.toThrow('transaction failed')
    expect(store.groups).toEqual([])
    expect(store.participants).toEqual([])
    expect(store.pendingCreateGroups).toEqual([])
  })

  test('updates Pinia only after durable creation completes', async () => {
    useAccessIdentityStore().hydrate({ id: ACTOR_ID, credential: '0123456789abcdef'.repeat(4) })
    const store = useGroupsStore()
    let release!: () => void
    const persistence = new Promise<void>(resolve => { release = resolve })
    const { createGroup } = useCreateGroup({ persistCreation: vi.fn(() => persistence) })

    const result = createGroup(draft())
    expect(store.groups).toEqual([])
    release()
    await expect(result).resolves.toMatchObject({ ok: true })
    expect(store.groups).toHaveLength(1)
    expect(store.pendingCreateGroups).toHaveLength(1)
  })
})
