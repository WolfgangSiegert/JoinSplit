import { synchronizePersonMutation } from '../services/person-sync'

export function usePendingPersonSync() {
  const config = useRuntimeConfig()
  const lifecycleStore = useApplicationLifecycleStore()
  const accountStore = useAccountStore()
  const peopleStore = usePeopleStore()
  const { online } = useConnectivity()
  let running = false

  async function synchronizePendingPeople(): Promise<void> {
    if (running || lifecycleStore.state !== 'ready' || !accountStore.isAuthenticated || !online.value) return
    running = true
    try {
      const blocked = new Set<string>()
      while (online.value) {
        const mutation = [...peopleStore.pendingMutations]
          .sort((left, right) => left.createdOrder - right.createdOrder)
          .find(item => !blocked.has(item.personId))
        if (!mutation) break
        const result = await synchronizePersonMutation({ apiBase: config.public.apiBase, mutation, peopleStore })
        if (result !== 'synced') blocked.add(mutation.personId)
      }
    } finally { running = false }
  }

  watch([
    () => lifecycleStore.state, online, () => accountStore.isAuthenticated,
    () => peopleStore.pendingMutations.length,
  ], ([state, isOnline, authenticated]) => {
    if (state === 'ready' && isOnline && authenticated) void synchronizePendingPeople()
  })

  return { synchronizePendingPeople }
}
