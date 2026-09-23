import { synchronizeCreateGroup } from '../services/create-group-sync'
import { synchronizeParticipantMutation } from '../services/participant-sync'
import { synchronizeExpenseMutation } from '../services/expense-sync'

export function useCreateGroupSync(groupId: Ref<string>) {
  const config = useRuntimeConfig()
  const identityStore = useAccessIdentityStore()
  const groupsStore = useGroupsStore()
  const { online } = useConnectivity()

  const syncState = computed(() => groupsStore.groupSyncState(groupId.value))
  const visibleState = computed(() => {
    if (!online.value && groupsStore.pendingMutations.some(item => item.groupId === groupId.value)) return 'offline' as const
    return syncState.value?.state ?? 'synced'
  })

  async function attemptSync(): Promise<void> {
    while (online.value) {
      const mutation = groupsStore.pendingMutations
        .filter(item => item.groupId === groupId.value)
        .sort((left, right) => left.createdOrder - right.createdOrder)[0]
      if (!mutation) return
      const result = mutation.type === 'CreateGroup'
        ? await synchronizeCreateGroup({ groupId: groupId.value, apiBase: config.public.apiBase,
            identity: identityStore, groupsStore, online: online.value })
        : mutation.type === 'CreateExpense' || mutation.type === 'UpdateExpense' || mutation.type === 'DeleteExpense'
          ? await synchronizeExpenseMutation({ mutationId: mutation.id, apiBase: config.public.apiBase,
              identity: identityStore, groupsStore, online: online.value })
          : await synchronizeParticipantMutation({ mutationId: mutation.id, apiBase: config.public.apiBase,
              identity: identityStore, groupsStore, online: online.value })
      if (result.outcome !== 'synced') return
    }
  }

  onMounted(() => {
    if (syncState.value?.state === 'pending') void attemptSync()
  })
  watch(online, isOnline => {
    const state = syncState.value
    const canRetryAfterReconnect = state?.state === 'pending'
      || (state?.state === 'failed' && state.error.retryable)
    if (isOnline && canRetryAfterReconnect) void attemptSync()
  })

  return { syncState, visibleState, online, attemptSync }
}
