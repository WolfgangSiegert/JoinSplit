import { sortPendingMutations } from '../domain/pending-mutation'
import { synchronizeCreateGroup } from '../services/create-group-sync'
import { synchronizeParticipantMutation } from '../services/participant-sync'
import { synchronizeExpenseMutation } from '../services/expense-sync'
import { synchronizeSettlementMutation } from '../services/settlement-sync'
import { synchronizeGroupLifecycleMutation } from '../services/group-lifecycle-sync'
import type { PendingMutation } from '../domain/pending-mutation'
import { ensureAccessIdentityRegistered, markAccessIdentityExpired } from '../services/access-identity-registration'

function unreachableMutation(mutation: never): never { throw new Error(`Unsupported pending mutation: ${String(mutation)}`) }

export function usePendingCreateGroupSync() {
  const config = useRuntimeConfig()
  const lifecycleStore = useApplicationLifecycleStore()
  const identityStore = useAccessIdentityStore()
  const groupsStore = useGroupsStore()
  const { online } = useConnectivity()
  let running = false

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
