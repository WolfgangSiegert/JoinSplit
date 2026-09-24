import type { Group } from './create-group'
import {
  freezePendingMutation,
  type PendingArchiveGroup,
  type PendingDeleteGroup,
  type PendingMutation,
  type PendingReactivateGroup,
} from './pending-mutation'

interface PrepareOptions {
  readonly createdOrder: number
  readonly generateId?: () => string
}

export function prepareGroupArchive(group: Readonly<Group>, options: PrepareOptions): {
  readonly group: Group
  readonly mutation: Readonly<PendingArchiveGroup>
} {
  if (group.status !== 'active' || !group.hasFinancialHistory) {
    throw new Error('Only an active Group with financial history can be archived')
  }
  const updated = { ...group, participantIds: [...group.participantIds], status: 'archived' as const }
  return {
    group: updated,
    mutation: freezePendingMutation({
      id: (options.generateId ?? (() => crypto.randomUUID()))(),
      type: 'ArchiveGroup', groupId: group.id, createdOrder: options.createdOrder,
      payload: { status: 'archived' },
    }),
  }
}

export function prepareGroupReactivation(group: Readonly<Group>, options: PrepareOptions): {
  readonly group: Group
  readonly mutation: Readonly<PendingReactivateGroup>
} {
  if (group.status !== 'archived') throw new Error('Archived Group required')
  const updated = { ...group, participantIds: [...group.participantIds], status: 'active' as const }
  return {
    group: updated,
    mutation: freezePendingMutation({
      id: (options.generateId ?? (() => crypto.randomUUID()))(),
      type: 'ReactivateGroup', groupId: group.id, createdOrder: options.createdOrder,
      payload: { status: 'active' },
    }),
  }
}

export function prepareGroupDelete(
  group: Readonly<Group>,
  pendingMutations: readonly PendingMutation[],
  hasFinancialRecords: boolean,
  options: PrepareOptions,
): Readonly<PendingDeleteGroup> {
  if (group.status !== 'active' || group.hasFinancialHistory || hasFinancialRecords) {
    throw new Error('Only an active Group without financial history can be deleted')
  }
  if (pendingMutations.some(mutation => mutation.groupId === group.id)) {
    throw new Error('Group synchronization must finish before deletion')
  }
  return freezePendingMutation({
    id: (options.generateId ?? (() => crypto.randomUUID()))(),
    type: 'DeleteGroup', groupId: group.id, createdOrder: options.createdOrder,
    payload: {},
  })
}
