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

interface GroupsState {
  groups: Group[]
  participants: Participant[]
  pendingCreateGroups: PendingCreateGroupMutation[]
}

export const useGroupsStore = defineStore('groups', {
  state: (): GroupsState => ({
    groups: [],
    participants: [],
    pendingCreateGroups: [],
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
      })
    },

    findGroup(groupId: string): Group | undefined {
      return this.groups.find(group => group.id === groupId)
    },

    hasPendingCreate(groupId: string): boolean {
      return this.pendingCreateGroups.some(mutation => mutation.payload.groupId === groupId)
    },
  },
})
