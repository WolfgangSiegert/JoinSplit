import { synchronizeCreateGroup } from '../services/create-group-sync'

export function useCreateGroupSync(groupId: Ref<string>) {
  const config = useRuntimeConfig()
  const identityStore = useAccessIdentityStore()
  const groupsStore = useGroupsStore()
  const { online } = useConnectivity()

  const syncState = computed(() => groupsStore.createGroupSync[groupId.value])
  const visibleState = computed(() => {
    if (!online.value && groupsStore.hasPendingCreate(groupId.value)) return 'offline' as const
    return syncState.value?.state ?? 'pending'
  })

  async function attemptSync(): Promise<void> {
    await synchronizeCreateGroup({
      groupId: groupId.value,
      apiBase: config.public.apiBase,
      identity: identityStore,
      groupsStore,
      online: online.value,
    })
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
