import { sortPendingMutations } from '../domain/pending-mutation'
import { synchronizeCreateGroup } from '../services/create-group-sync'
import { synchronizeParticipantMutation } from '../services/participant-sync'
import { synchronizeExpenseMutation } from '../services/expense-sync'
import { synchronizeSettlementMutation } from '../services/settlement-sync'
import type { PendingMutation } from '../domain/pending-mutation'

function unreachableMutation(mutation: never): never { throw new Error(`Unsupported pending mutation: ${String(mutation)}`) }

export function usePendingCreateGroupSync() {
  const config = useRuntimeConfig()
  const lifecycleStore = useApplicationLifecycleStore()
  const identityStore = useAccessIdentityStore()
  const groupsStore = useGroupsStore()
  const { online } = useConnectivity()
  let running = false

  async function synchronizeMutation(mutation: PendingMutation) {
    const options = { mutationId: mutation.id, apiBase: config.public.apiBase, identity: identityStore, groupsStore, online: online.value }
    switch (mutation.type) {
      case 'CreateGroup':
        return synchronizeCreateGroup({ groupId: mutation.groupId, apiBase: config.public.apiBase, identity: identityStore, groupsStore, online: online.value })
      case 'CreateExpense':
      case 'UpdateExpense':
      case 'DeleteExpense':
        return synchronizeExpenseMutation(options)
      case 'CreateSettlement':
      case 'UpdateSettlement':
      case 'DeleteSettlement':
        return synchronizeSettlementMutation(options)
      case 'AddParticipant':
      case 'RenameParticipant':
      case 'DeactivateParticipant':
      case 'DeleteParticipant':
        return synchronizeParticipantMutation(options)
      default:
        return unreachableMutation(mutation)
    }
  }

  async function synchronizePending(): Promise<void> {
    if (running || lifecycleStore.state !== 'ready' || !online.value) return
    running = true
    try {
      const blockedGroups = new Set<string>()
      while (online.value) {
        const mutation = sortPendingMutations(groupsStore.pendingMutations)
          .find(item => !blockedGroups.has(item.groupId))
        if (!mutation) break
        const result = await synchronizeMutation(mutation)
        if (result.outcome !== 'synced') blockedGroups.add(mutation.groupId)
      }
    } finally { running = false }
  }

  watch([() => lifecycleStore.state, online, () => groupsStore.pendingMutations.length], ([state, isOnline]) => {
    if (state === 'ready' && isOnline) void synchronizePending()
  })
  return { synchronizePending }
}
