import type { Group, Participant } from '../domain/create-group'
import type { PendingCreateGroupMutation } from '../stores/groups'
import type { DurableState } from './database'
import { normalizeName } from '../domain/create-group'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const CREDENTIAL = /^[0-9a-f]{64}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function isName(value: unknown): value is string {
  return typeof value === 'string'
    && normalizeName(value) === value
    && Array.from(value).length >= 1
    && Array.from(value).length <= 100
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value)
}

function isGroup(value: unknown): value is Group {
  return isRecord(value)
    && hasOnlyKeys(value, ['id', 'name', 'currency', 'ownerAccessIdentityId', 'status', 'participantIds'])
    && isUuid(value.id)
    && isName(value.name)
    && value.currency === 'EUR'
    && isUuid(value.ownerAccessIdentityId)
    && value.status === 'active'
    && Array.isArray(value.participantIds)
    && value.participantIds.every(isUuid)
    && new Set(value.participantIds).size === value.participantIds.length
}

function isParticipant(value: unknown): value is Participant {
  return isRecord(value)
    && hasOnlyKeys(value, ['id', 'groupId', 'name', 'status', 'order'])
    && isUuid(value.id)
    && isUuid(value.groupId)
    && isName(value.name)
    && value.status === 'active'
    && Number.isSafeInteger(value.order)
    && (value.order as number) >= 0
}

function isPendingMutation(value: unknown): value is PendingCreateGroupMutation {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ['kind', 'payload', 'status'])
    || value.kind !== 'CreateGroup' || value.status !== 'pending') return false
  const payload = value.payload
  if (!isRecord(payload)
    || !hasOnlyKeys(payload, ['groupId', 'name', 'currency', 'actorId', 'initialParticipant'])
    || !isUuid(payload.groupId)
    || !isName(payload.name)
    || payload.currency !== 'EUR'
    || !isUuid(payload.actorId)) return false

  const participant = payload.initialParticipant
  return participant === null
    || (isRecord(participant)
      && hasOnlyKeys(participant, ['participantId', 'name'])
      && isUuid(participant.participantId)
      && isName(participant.name))
}

export function validateDurableState(value: DurableState): DurableState {
  const identity = value.accessIdentity
  if (identity !== null && (!isUuid(identity.id) || !CREDENTIAL.test(identity.credential))) {
    throw new Error('Invalid persisted access identity')
  }
  if (!value.groups.every(isGroup)
    || !value.participants.every(isParticipant)
    || !value.pendingMutations.every(isPendingMutation)
    || (value.settings !== null
      && typeof value.settings.addSelfAsParticipantByDefault !== 'boolean')) {
    throw new Error('Invalid persisted state shape')
  }

  const groupIds = new Set(value.groups.map(group => group.id))
  const participantIds = new Set(value.participants.map(participant => participant.id))
  if (groupIds.size !== value.groups.length || participantIds.size !== value.participants.length) {
    throw new Error('Duplicate persisted identifiers')
  }
  if ([...groupIds].some(id => participantIds.has(id))) {
    throw new Error('Persisted group and participant identifiers collide')
  }
  if (!identity && (value.groups.length || value.participants.length || value.pendingMutations.length)) {
    throw new Error('Persisted domain state has no access identity')
  }

  for (const group of value.groups) {
    if (identity && group.ownerAccessIdentityId !== identity.id) {
      throw new Error('Persisted group owner does not match access identity')
    }
    if (group.participantIds.some((id, index) => {
      const participant = value.participants.find(candidate => candidate.id === id)
      return !participant || participant.groupId !== group.id || participant.order !== index
    })) {
      throw new Error('Persisted group participant ordering is inconsistent')
    }
  }

  for (const participant of value.participants) {
    const group = value.groups.find(candidate => candidate.id === participant.groupId)
    if (!group || !group.participantIds.includes(participant.id)) {
      throw new Error('Persisted participant is not linked to its group')
    }
  }

  const pendingGroupIds = new Set<string>()
  for (const mutation of value.pendingMutations) {
    const payload = mutation.payload
    const group = value.groups.find(candidate => candidate.id === payload.groupId)
    if (!identity || payload.actorId !== identity.id || !group
      || group.name !== payload.name || group.currency !== payload.currency
      || pendingGroupIds.has(payload.groupId)) {
      throw new Error('Persisted mutation does not match its group')
    }
    pendingGroupIds.add(payload.groupId)

    if (payload.initialParticipant === null) {
      if (group.participantIds.length !== 0) {
        throw new Error('Persisted mutation participant selection does not match its group')
      }
      continue
    }

    const participant = value.participants.find(
      candidate => candidate.id === payload.initialParticipant?.participantId,
    )
    if (!participant || participant.groupId !== group.id
      || participant.name !== payload.initialParticipant.name
      || participant.order !== 0 || group.participantIds[0] !== participant.id) {
      throw new Error('Persisted mutation participant does not match its group')
    }
  }

  return value
}
