import { synchronizeCreateGroup } from '../services/create-group-sync'
import { synchronizeParticipantMutation } from '../services/participant-sync'
import { synchronizeExpenseMutation } from '../services/expense-sync'
import { synchronizeSettlementMutation } from '../services/settlement-sync'
import type { PendingMutation } from '../domain/pending-mutation'

function unreachableMutation(mutation: never): never { throw new Error(`Unsupported pending mutation: ${String(mutation)}`) }

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

  async function attemptSync(): Promise<void> {
    while (online.value) {
      const mutation = groupsStore.pendingMutations
        .filter(item => item.groupId === groupId.value)
        .sort((left, right) => left.createdOrder - right.createdOrder)[0]
      if (!mutation) return
      const result = await synchronizeMutation(mutation)
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
