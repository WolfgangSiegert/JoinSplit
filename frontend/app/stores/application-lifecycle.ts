import { defineStore } from 'pinia'
import { ref } from 'vue'
import { generateAccessIdentity, useAccessIdentityStore } from './access-identity'
import { useGroupsStore } from './groups'
import { useSettingsStore } from './settings'
import { useAccountStore } from './account'
import {
  loadDurableState,
  persistAccessIdentity,
  type DurableState,
} from '../persistence/database'
import { validateDurableState } from '../persistence/validation'
import { restorePendingMutation } from '../domain/pending-mutation'
import { restoreSettlement } from '../domain/settlement'

export type ApplicationLifecycle = 'loading' | 'ready' | 'failed'

interface BootstrapDependencies {
  load: () => Promise<DurableState>
  persistIdentity: typeof persistAccessIdentity
}

export const useApplicationLifecycleStore = defineStore('applicationLifecycle', () => {
  const state = ref<ApplicationLifecycle>('loading')

  async function initialize(dependencies: BootstrapDependencies = {
    load: loadDurableState,
    persistIdentity: persistAccessIdentity,
  }): Promise<void> {
    if (state.value !== 'loading') return

    try {
      const durableState = validateDurableState(await dependencies.load())
      const identity = durableState.accessIdentity ?? generateAccessIdentity()

      if (!durableState.accessIdentity) {
        await dependencies.persistIdentity(identity)
      }

      useAccessIdentityStore().hydrate(identity)
      useAccountStore().hydrate(durableState.accountWorkspace ?? null)
      useGroupsStore().hydrate({
        groups: durableState.groups,
        participants: durableState.participants,
        expenses: durableState.expenses,
        settlements: durableState.settlements.map(restoreSettlement),
        pendingMutations: durableState.pendingMutations.map(restorePendingMutation),
        groupRevisions: durableState.accountWorkspace?.groupRevisions,
        conflictedGroupIds: durableState.accountWorkspace?.conflictedGroupIds,
      })
      useSettingsStore().hydrate(durableState.settings)
      state.value = 'ready'
    } catch {
      state.value = 'failed'
    }
  }

  return { state, initialize }
})
