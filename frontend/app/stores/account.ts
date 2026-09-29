import { defineStore } from 'pinia'
import type { DurableAccountWorkspace } from '../persistence/database'

export type AccountSessionState = 'none' | 'checking' | 'active' | 'expired' | 'offline' | 'signed-out'

export const useAccountStore = defineStore('account', {
  state: (): { workspace: DurableAccountWorkspace | null; busy: boolean; error: string; sessionState: AccountSessionState; sessionRevision: number } => ({
    workspace: null,
    busy: false,
    error: '',
    sessionState: 'none',
    sessionRevision: 0,
  }),
  getters: {
    isAuthenticated: state => state.workspace !== null,
    hasActiveSession: state => state.workspace !== null && state.sessionState === 'active',
    needsReauthentication: state => state.workspace !== null && ['expired', 'signed-out'].includes(state.sessionState),
    pendingConflictCount: state => state.workspace?.conflictedGroupIds.length ?? 0,
  },
  actions: {
    hydrate(workspace: DurableAccountWorkspace | null): void {
      this.workspace = workspace
      this.sessionState = workspace ? 'checking' : 'none'
    },
    beginSessionCheck(): void {
      if (this.workspace) this.sessionState = 'checking'
    },
    activateSession(): void {
      if (!this.workspace) return
      this.sessionState = 'active'
      this.sessionRevision += 1
      this.busy = false
      this.error = ''
    },
    expireSession(message = 'Deine Anmeldung ist abgelaufen. Melde dich erneut an; deine lokalen Änderungen bleiben erhalten.'): void {
      if (!this.workspace) return
      this.sessionState = 'expired'
      this.error = message
    },
    markSessionOffline(): void {
      if (this.workspace) this.sessionState = 'offline'
    },
    markSignedOut(): void {
      if (!this.workspace) return
      this.sessionState = 'signed-out'
      this.busy = false
      this.error = ''
    },
    begin(): void { this.busy = true; this.error = '' },
    fail(message: string): void { this.busy = false; this.error = message },
    succeed(): void { this.busy = false; this.error = '' },
    clearError(): void { this.error = '' },
    recordSynchronization(at = new Date().toISOString()): void {
      if (this.workspace) this.workspace = { ...this.workspace, lastSuccessfulSyncAt: at }
    },
    finish(workspace: DurableAccountWorkspace | null): void {
      this.workspace = workspace; this.busy = false; this.error = ''
      this.sessionState = workspace ? 'active' : 'none'
      if (workspace) this.sessionRevision += 1
    },
  },
})
