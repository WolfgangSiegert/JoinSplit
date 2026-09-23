import type { Group, Participant } from '../domain/create-group'
import type { PendingMutation } from '../domain/pending-mutation'
import type { DurableState } from './database'
import { normalizeName } from '../domain/create-group'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const CREDENTIAL = /^[0-9a-f]{64}$/u
const TYPES = new Set(['CreateGroup', 'AddParticipant', 'RenameParticipant', 'DeactivateParticipant', 'DeleteParticipant'])
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value); return actual.length === expected.length && actual.every(key => expected.includes(key))
}
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID_V4.test(value) }
function name(value: unknown): value is string { return typeof value === 'string' && normalizeName(value) === value && Array.from(value).length >= 1 && Array.from(value).length <= 100 }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 }

function group(value: unknown): value is Group {
  return record(value) && keys(value, ['id', 'name', 'currency', 'ownerAccessIdentityId', 'status', 'participantIds'])
    && uuid(value.id) && name(value.name) && value.currency === 'EUR' && uuid(value.ownerAccessIdentityId)
    && value.status === 'active' && Array.isArray(value.participantIds) && value.participantIds.every(uuid)
    && new Set(value.participantIds).size === value.participantIds.length
}

function participant(value: unknown): value is Participant {
  return record(value) && keys(value, ['id', 'groupId', 'name', 'status', 'order'])
    && uuid(value.id) && uuid(value.groupId) && name(value.name)
    && (value.status === 'active' || value.status === 'inactive') && integer(value.order)
}

function mutation(value: unknown): value is PendingMutation {
  if (!record(value) || !keys(value, ['id', 'type', 'groupId', 'createdOrder', 'payload'])
    || !uuid(value.id) || typeof value.type !== 'string' || !TYPES.has(value.type)
    || !uuid(value.groupId) || !integer(value.createdOrder) || !record(value.payload)) return false
  const payload = value.payload
  if (value.type === 'CreateGroup') {
    if (!keys(payload, ['groupId', 'name', 'currency', 'actorId', 'initialParticipant'])
      || payload.groupId !== value.groupId || !name(payload.name) || payload.currency !== 'EUR' || !uuid(payload.actorId)) return false
    return payload.initialParticipant === null || (record(payload.initialParticipant)
      && keys(payload.initialParticipant, ['participantId', 'name'])
      && uuid(payload.initialParticipant.participantId) && name(payload.initialParticipant.name))
  }
  if (value.type === 'AddParticipant') return keys(payload, ['participantId', 'name', 'order']) && uuid(payload.participantId) && name(payload.name) && integer(payload.order)
  if (value.type === 'RenameParticipant') return keys(payload, ['participantId', 'name', 'active', 'order'])
    && uuid(payload.participantId) && name(payload.name) && typeof payload.active === 'boolean' && integer(payload.order)
  if (value.type === 'DeactivateParticipant') return keys(payload, ['participantId', 'name', 'active', 'order'])
    && uuid(payload.participantId) && name(payload.name) && payload.active === false && integer(payload.order)
  return keys(payload, ['participantId']) && uuid(payload.participantId)
}

export function validateDurableState(value: DurableState): DurableState {
  const identity = value.accessIdentity
  if (identity !== null && (!uuid(identity.id) || !CREDENTIAL.test(identity.credential))) throw new Error('Invalid persisted access identity')
  if (!value.groups.every(group) || !value.participants.every(participant) || !value.pendingMutations.every(mutation)
    || (value.settings !== null && typeof value.settings.addSelfAsParticipantByDefault !== 'boolean')) throw new Error('Invalid persisted state shape')

  const groupIds = new Set(value.groups.map(item => item.id)); const participantIds = new Set(value.participants.map(item => item.id))
  const mutationIds = new Set(value.pendingMutations.map(item => item.id)); const createdOrders = new Set(value.pendingMutations.map(item => item.createdOrder))
  if (groupIds.size !== value.groups.length || participantIds.size !== value.participants.length
    || mutationIds.size !== value.pendingMutations.length || createdOrders.size !== value.pendingMutations.length) throw new Error('Duplicate persisted identifiers or queue order')
  if ([...groupIds].some(id => participantIds.has(id))) throw new Error('Persisted group and participant identifiers collide')
  if (!identity && (value.groups.length || value.participants.length || value.pendingMutations.length)) throw new Error('Persisted domain state has no access identity')

  for (const currentGroup of value.groups) {
    if (identity && currentGroup.ownerAccessIdentityId !== identity.id) throw new Error('Persisted group owner does not match access identity')
    const ordered = value.participants.filter(item => item.groupId === currentGroup.id).sort((a, b) => a.order - b.order)
    if (new Set(ordered.map(item => item.order)).size !== ordered.length
      || ordered.map(item => item.id).join('|') !== currentGroup.participantIds.join('|')) throw new Error('Persisted group participant ordering is inconsistent')
  }
  if (value.participants.some(item => !groupIds.has(item.groupId))) throw new Error('Persisted participant has no group')

  const orderedMutations = [...value.pendingMutations].sort((a, b) => a.createdOrder - b.createdOrder)
  const latestParticipantMutation = new Map<string, PendingMutation>()
  for (const current of orderedMutations) {
    const currentGroup = value.groups.find(item => item.id === current.groupId)
    if (!currentGroup) throw new Error('Persisted mutation has no group')
    if (current.type === 'CreateGroup') {
      if (!identity || current.payload.actorId !== identity.id || current.payload.name !== currentGroup.name) throw new Error('Persisted CreateGroup mismatch')
      const initial = current.payload.initialParticipant
      if (initial) {
        latestParticipantMutation.set(initial.participantId, current)
      }
      continue
    }
    const participantId = current.payload.participantId
    const localParticipant = value.participants.find(item => item.id === participantId)
    if (localParticipant && localParticipant.groupId !== current.groupId) throw new Error('Persisted Participant mutation group mismatch')
    latestParticipantMutation.set(participantId, current)
  }

  for (const [participantId, latest] of latestParticipantMutation) {
    const local = value.participants.find(item => item.id === participantId)
    if (latest.type === 'DeleteParticipant') {
      if (local) throw new Error('Persisted DeleteParticipant local state mismatch')
      continue
    }
    if (!local) throw new Error('Persisted Participant mutation has no participant')
    if (latest.type === 'CreateGroup') {
      const initial = latest.payload.initialParticipant
      if (!initial || local.groupId !== latest.groupId || local.name !== initial.name
        || local.status !== 'active' || local.order !== 0) throw new Error('Persisted CreateGroup participant mismatch')
      continue
    }
    const expectedName = latest.payload.name
    const expectedActive = latest.type === 'AddParticipant' ? true : latest.payload.active
    if (local.groupId !== latest.groupId || local.name !== expectedName
      || (local.status === 'active') !== expectedActive || local.order !== latest.payload.order) {
      throw new Error(`Persisted ${latest.type} local state mismatch`)
    }
  }
  return value
}
