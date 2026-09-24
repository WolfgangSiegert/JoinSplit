import { prepareGroupArchive, prepareGroupDelete, prepareGroupReactivation } from '../domain/group-lifecycle'
import { persistGroupDeleteRequest, persistGroupStatus } from '../persistence/database'
import { useGroupsStore } from '../stores/groups'
import { serializeGroupLocalWrite } from './group-local-write'

interface Dependencies {
  readonly persistStatus: typeof persistGroupStatus
  readonly persistDeleteRequest: typeof persistGroupDeleteRequest
}

export function useGroupLifecycle(dependencies: Dependencies = {
  persistStatus: persistGroupStatus,
  persistDeleteRequest: persistGroupDeleteRequest,
}) {
  const groupsStore = useGroupsStore()

  async function archive(groupId: string): Promise<void> {
    await serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findStoredGroup(groupId)
      if (!group || groupsStore.hasPendingGroupDelete(groupId)) throw new Error('Mutable Group required')
      const prepared = prepareGroupArchive(group, { createdOrder })
      await dependencies.persistStatus(prepared.group, prepared.mutation)
      groupsStore.commitGroupStatus(prepared.group, prepared.mutation)
    })
  }

  async function reactivate(groupId: string): Promise<void> {
    await serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findStoredGroup(groupId)
      if (!group || groupsStore.hasPendingGroupDelete(groupId)) throw new Error('Archived Group required')
      const prepared = prepareGroupReactivation(group, { createdOrder })
      await dependencies.persistStatus(prepared.group, prepared.mutation)
      groupsStore.commitGroupStatus(prepared.group, prepared.mutation)
    })
  }

  async function remove(groupId: string): Promise<void> {
    await serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findStoredGroup(groupId)
      if (!group) throw new Error('Group required')
      const hasFinancialRecords = groupsStore.expenses.some(expense => expense.groupId === groupId)
        || groupsStore.settlements.some(settlement => settlement.groupId === groupId)
      const mutation = prepareGroupDelete(group, groupsStore.pendingMutations, hasFinancialRecords, { createdOrder })
      await dependencies.persistDeleteRequest(mutation)
      groupsStore.commitGroupDeleteRequest(mutation)
    })
  }

  return { archive, reactivate, remove }
}
