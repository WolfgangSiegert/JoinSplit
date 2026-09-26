import { defineStore } from 'pinia'
import type { DurableAccountWorkspace } from '../persistence/database'

export const useAccountStore = defineStore('account', {
  state: (): { workspace: DurableAccountWorkspace | null; busy: boolean; error: string } => ({
    workspace: null,
    busy: false,
    error: '',
  }),
  getters: {
    isAuthenticated: state => state.workspace !== null,
    pendingConflictCount: state => state.workspace?.conflictedGroupIds.length ?? 0,
  },
  actions: {
    hydrate(workspace: DurableAccountWorkspace | null): void { this.workspace = workspace },
    begin(): void { this.busy = true; this.error = '' },
    fail(message: string): void { this.busy = false; this.error = message },
    finish(workspace: DurableAccountWorkspace | null): void {
      this.workspace = workspace; this.busy = false; this.error = ''
    },
  },
})
