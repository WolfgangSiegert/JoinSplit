import { defineStore } from 'pinia'
import type {
  CreateGroupPayload,
  Group,
  Participant,
  PreparedGroupCreation,
} from '../domain/create-group'

export interface PendingCreateGroupMutation {
  readonly kind: 'CreateGroup'
  readonly payload: Readonly<CreateGroupPayload>
  readonly status: 'pending'
}

export type CreateGroupSyncErrorKind =
  | 'network'
  | 'unauthorized'
  | 'conflict'
  | 'validation'
  | 'server'
  | 'unexpected'
  | 'reconciliation'
  | 'identity'

export interface CreateGroupSyncError {
  readonly kind: CreateGroupSyncErrorKind
  readonly message: string
  readonly retryable: boolean
}

export type CreateGroupSyncState =
  | { readonly state: 'pending'; readonly error: null }
  | { readonly state: 'syncing'; readonly error: null }
  | { readonly state: 'synced'; readonly error: null }
  | { readonly state: 'failed'; readonly error: Readonly<CreateGroupSyncError> }

interface GroupsState {
  groups: Group[]
  participants: Participant[]
  pendingCreateGroups: PendingCreateGroupMutation[]
  createGroupSync: Record<string, CreateGroupSyncState>
}

export const useGroupsStore = defineStore('groups', {
  state: (): GroupsState => ({
    groups: [],
    participants: [],
    pendingCreateGroups: [],
    createGroupSync: {},
  }),

  actions: {
    commitCreation(creation: PreparedGroupCreation): void {
      if (this.groups.some(group => group.id === creation.group.id)) {
        return
      }

      const pendingMutation = Object.freeze({
        kind: 'CreateGroup' as const,
        payload: creation.payload,
        status: 'pending' as const,
      })

      this.$patch({
        groups: [...this.groups, creation.group],
        participants: creation.participant
          ? [...this.participants, creation.participant]
          : this.participants,
        pendingCreateGroups: [...this.pendingCreateGroups, pendingMutation],
        createGroupSync: {
          ...this.createGroupSync,
          [creation.group.id]: { state: 'pending', error: null },
        },
      })
    },

    findGroup(groupId: string): Group | undefined {
      return this.groups.find(group => group.id === groupId)
    },

    hasPendingCreate(groupId: string): boolean {
      return this.pendingCreateGroups.some(mutation => mutation.payload.groupId === groupId)
    },

    findPendingCreate(groupId: string): PendingCreateGroupMutation | undefined {
      return this.pendingCreateGroups.find(mutation => mutation.payload.groupId === groupId)
    },

    beginCreateGroupSync(groupId: string): PendingCreateGroupMutation | null {
      const mutation = this.findPendingCreate(groupId)
      if (!mutation || this.createGroupSync[groupId]?.state === 'syncing') {
        return null
      }

      this.createGroupSync[groupId] = { state: 'syncing', error: null }
      return mutation
    },

    failCreateGroupSync(groupId: string, error: CreateGroupSyncError): void {
      if (!this.hasPendingCreate(groupId)) return

      this.createGroupSync[groupId] = {
        state: 'failed',
        error: Object.freeze({ ...error }),
      }
    },

    confirmCreateGroupSync(groupId: string): void {
      if (!this.hasPendingCreate(groupId)) return

      this.pendingCreateGroups = this.pendingCreateGroups.filter(
        mutation => mutation.payload.groupId !== groupId,
      )
      this.createGroupSync[groupId] = { state: 'synced', error: null }
    },
  },
})
