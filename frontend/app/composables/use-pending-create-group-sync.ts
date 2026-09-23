import { synchronizeCreateGroup } from '../services/create-group-sync'

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
      const groupIds = groupsStore.pendingCreateGroups.map(mutation => mutation.payload.groupId)
      for (const groupId of groupIds) {
        await synchronizeCreateGroup({
          groupId,
          apiBase: config.public.apiBase,
          identity: identityStore,
          groupsStore,
          online: online.value,
        })
      }
    } finally {
      running = false
    }
  }

  watch([() => lifecycleStore.state, online], ([state, isOnline]) => {
    if (state === 'ready' && isOnline) void synchronizePending()
  })

  return { synchronizePending }
}
