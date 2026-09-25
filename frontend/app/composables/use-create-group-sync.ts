import { synchronizeCreateGroup } from '../services/create-group-sync'
import { synchronizeParticipantMutation } from '../services/participant-sync'
import { synchronizeExpenseMutation } from '../services/expense-sync'
import { synchronizeSettlementMutation } from '../services/settlement-sync'
import { synchronizeGroupLifecycleMutation } from '../services/group-lifecycle-sync'
import type { PendingMutation } from '../domain/pending-mutation'
import { ensureAccessIdentityRegistered, markAccessIdentityExpired } from '../services/access-identity-registration'

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
    const registration = await ensureAccessIdentityRegistered({
      apiBase: config.public.apiBase,
      identity: identityStore,
      online: online.value,
    })
    if (registration.outcome === 'failed') {
      groupsStore.failMutationSync(mutation.id, registration.error)
      return registration
    }

    const options = { mutationId: mutation.id, apiBase: config.public.apiBase, identity: identityStore, groupsStore, online: online.value }
    let result
    switch (mutation.type) {
      case 'CreateGroup':
        result = await synchronizeCreateGroup({ groupId: mutation.groupId, apiBase: config.public.apiBase, identity: identityStore, groupsStore, online: online.value })
        break
      case 'CreateExpense':
      case 'UpdateExpense':
      case 'DeleteExpense':
        result = await synchronizeExpenseMutation(options)
        break
      case 'CreateSettlement':
      case 'UpdateSettlement':
      case 'DeleteSettlement':
        result = await synchronizeSettlementMutation(options)
        break
      case 'AddParticipant':
      case 'RenameParticipant':
      case 'DeactivateParticipant':
      case 'DeleteParticipant':
        result = await synchronizeParticipantMutation(options)
        break
      case 'ArchiveGroup':
      case 'ReactivateGroup':
      case 'DeleteGroup':
        result = await synchronizeGroupLifecycleMutation(options)
        break
      default:
        return unreachableMutation(mutation)
    }
    if (result.outcome === 'failed' && result.error.kind === 'expired') {
      try { await markAccessIdentityExpired({ identity: identityStore }) } catch { /* terminal in memory */ }
    }
    return result
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
