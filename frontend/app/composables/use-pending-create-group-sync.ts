import { sortPendingMutations } from '../domain/pending-mutation'
import { synchronizeCreateGroup } from '../services/create-group-sync'
import { synchronizeParticipantMutation } from '../services/participant-sync'
import { synchronizeExpenseMutation } from '../services/expense-sync'

export function usePendingCreateGroupSync() {
  const config = useRuntimeConfig()
  const lifecycleStore = useApplicationLifecycleStore()
  const identityStore = useAccessIdentityStore()
  const groupsStore = useGroupsStore()
  const { online } = useConnectivity()
  let running = false

  async function synchronizePending(): Promise<void> {
    if (running || lifecycleStore.state !== 'ready' || !online.value) return
    running = true
    try {
      const blockedGroups = new Set<string>()
      while (online.value) {
        const mutation = sortPendingMutations(groupsStore.pendingMutations)
          .find(item => !blockedGroups.has(item.groupId))
        if (!mutation) break
        const result = mutation.type === 'CreateGroup'
          ? await synchronizeCreateGroup({ groupId: mutation.groupId, apiBase: config.public.apiBase,
              identity: identityStore, groupsStore, online: online.value })
          : mutation.type === 'CreateExpense' || mutation.type === 'UpdateExpense' || mutation.type === 'DeleteExpense'
            ? await synchronizeExpenseMutation({ mutationId: mutation.id, apiBase: config.public.apiBase,
              identity: identityStore, groupsStore, online: online.value })
            : await synchronizeParticipantMutation({ mutationId: mutation.id, apiBase: config.public.apiBase,
              identity: identityStore, groupsStore, online: online.value })
        if (result.outcome !== 'synced') blockedGroups.add(mutation.groupId)
      }
    } finally { running = false }
  }

  watch([() => lifecycleStore.state, online, () => groupsStore.pendingMutations.length], ([state, isOnline]) => {
    if (state === 'ready' && isOnline) void synchronizePending()
  })
  return { synchronizePending }
}
