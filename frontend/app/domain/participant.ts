import { normalizeName, type Group, type Participant } from './create-group'
import {
  freezePendingMutation,
  nextCreatedOrder,
  type PendingAddParticipant,
  type PendingDeactivateParticipant,
  type PendingDeleteParticipant,
  type PendingMutation,
  type PendingRenameParticipant,
} from './pending-mutation'

export interface ParticipantNameErrors {
  name?: string
}

export interface PreparedParticipantAdd {
  readonly participant: Participant
  readonly group: Group
  readonly mutation: Readonly<PendingAddParticipant>
}

export interface PreparedParticipantUpdate<TMutation extends PendingMutation> {
  readonly participant: Participant
  readonly mutation: Readonly<TMutation>
}

export interface PreparedParticipantDelete {
  readonly group: Group
  readonly mutation: Readonly<PendingDeleteParticipant>
}

export function validateParticipantName(value: string): {
  normalizedName: string
  errors: ParticipantNameErrors
} {
  const normalizedName = normalizeName(value)
  const length = Array.from(normalizedName).length
  if (length === 0) return { normalizedName, errors: { name: 'Name ist erforderlich.' } }
  if (length > 100) {
    return { normalizedName, errors: { name: 'Name darf höchstens 100 Zeichen lang sein.' } }
  }
  return { normalizedName, errors: {} }
}

export function hasDuplicateParticipantName(
  participants: readonly Participant[],
  name: string,
  excludedParticipantId?: string,
): boolean {
  const normalizedName = normalizeName(name).toLocaleLowerCase('de-DE')
  if (!normalizedName) return false

  return participants.some(participant => participant.id !== excludedParticipantId
    && normalizeName(participant.name).toLocaleLowerCase('de-DE') === normalizedName)
}

export function nextParticipantOrder(participants: readonly Participant[]): number {
  return participants.reduce((maximum, participant) => Math.max(maximum, participant.order), -1) + 1
}

export function prepareParticipantAdd(
  group: Group,
  participants: readonly Participant[],
  pendingMutations: readonly PendingMutation[],
  name: string,
  generateId: () => string = () => crypto.randomUUID(),
  createdOrder: number = nextCreatedOrder(pendingMutations),
): { ok: true; value: PreparedParticipantAdd } | { ok: false; errors: ParticipantNameErrors } {
  const validation = validateParticipantName(name)
  if (validation.errors.name) return { ok: false, errors: validation.errors }

  const participantId = generateId()
  const mutationId = generateId()
  const order = nextParticipantOrder(participants)
  const participant: Participant = {
    id: participantId,
    groupId: group.id,
    name: validation.normalizedName,
    status: 'active',
    order,
  }
  const mutation = freezePendingMutation<PendingAddParticipant>({
    id: mutationId,
    type: 'AddParticipant',
    groupId: group.id,
    createdOrder,
    payload: { participantId, name: validation.normalizedName, order },
  })

  return {
    ok: true,
    value: {
      participant,
      group: { ...group, participantIds: [...group.participantIds, participantId] },
      mutation,
    },
  }
}

export function prepareParticipantRename(
  participant: Participant,
  pendingMutations: readonly PendingMutation[],
  name: string,
  generateId: () => string = () => crypto.randomUUID(),
  createdOrder: number = nextCreatedOrder(pendingMutations),
): { ok: true; value: PreparedParticipantUpdate<PendingRenameParticipant> }
  | { ok: false; errors: ParticipantNameErrors } {
  const validation = validateParticipantName(name)
  if (validation.errors.name) return { ok: false, errors: validation.errors }
  return {
    ok: true,
    value: {
      participant: { ...participant, name: validation.normalizedName },
      mutation: freezePendingMutation({
        id: generateId(), type: 'RenameParticipant', groupId: participant.groupId,
        createdOrder,
        payload: {
          participantId: participant.id,
          name: validation.normalizedName,
          active: participant.status === 'active',
          order: participant.order,
        },
      }),
    },
  }
}

export function prepareParticipantDeactivate(
  participant: Participant,
  pendingMutations: readonly PendingMutation[],
  generateId: () => string = () => crypto.randomUUID(),
  createdOrder: number = nextCreatedOrder(pendingMutations),
): PreparedParticipantUpdate<PendingDeactivateParticipant> {
  return {
    participant: { ...participant, status: 'inactive' },
    mutation: freezePendingMutation({
      id: generateId(), type: 'DeactivateParticipant', groupId: participant.groupId,
        createdOrder,
      payload: { participantId: participant.id, name: participant.name, active: false, order: participant.order },
    }),
  }
}

export function canDeleteParticipant(hasFinancialReferences: boolean): boolean {
  return !hasFinancialReferences
}

export function prepareParticipantDelete(
  group: Group,
  participant: Participant,
  pendingMutations: readonly PendingMutation[],
  generateId: () => string = () => crypto.randomUUID(),
  createdOrder: number = nextCreatedOrder(pendingMutations),
): PreparedParticipantDelete {
  return {
    group: { ...group, participantIds: group.participantIds.filter(id => id !== participant.id) },
    mutation: freezePendingMutation({
      id: generateId(), type: 'DeleteParticipant', groupId: group.id,
      createdOrder, payload: { participantId: participant.id },
    }),
  }
}
