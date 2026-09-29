import { AccountRequestError, fetchCurrentAccount } from '../services/account'

export function useAccountSession() {
  const config = useRuntimeConfig()
  const lifecycleStore = useApplicationLifecycleStore()
  const accountStore = useAccountStore()
  const groupsStore = useGroupsStore()
  const settingsStore = useSettingsStore()

  function markPendingAsExpired(): void {
    const error = Object.freeze({
      kind: 'session-expired' as const,
      message: 'Deine Anmeldung ist abgelaufen. Melde dich erneut an; die Änderung bleibt lokal gespeichert.',
      retryable: false,
    })
    for (const mutation of groupsStore.pendingMutations) groupsStore.failMutationSync(mutation.id, error)
  }

  async function verifySession(): Promise<void> {
    if (lifecycleStore.state !== 'ready' || !accountStore.workspace) return
    accountStore.beginSessionCheck()
    try {
      const account = await fetchCurrentAccount(config.public.apiBase)
      if (account.id !== accountStore.workspace.accountId) {
        accountStore.expireSession('Die aktive Serversitzung gehört nicht zu den lokal gespeicherten Accountdaten. Melde dich erneut an.')
        markPendingAsExpired()
        return
      }
      await settingsStore.applyAccountPreferences(account)
      accountStore.activateSession()
    } catch (error) {
      if (error instanceof AccountRequestError && error.status === 401) {
        accountStore.expireSession()
        markPendingAsExpired()
      } else accountStore.markSessionOffline()
    }
  }

  watch(() => lifecycleStore.state, state => {
    if (state === 'ready') void verifySession()
  }, { immediate: true })

  return { verifySession }
}
