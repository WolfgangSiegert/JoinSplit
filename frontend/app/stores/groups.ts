import { defineStore } from 'pinia'
import type { Group, Participant, PreparedGroupCreation } from '../domain/create-group'
import { prepareCreateGroupMutation, type PendingCreateGroup, type PendingMutation } from '../domain/pending-mutation'
import type { Expense } from '../domain/expense'

export type MutationSyncErrorKind =
  | 'network' | 'unauthorized' | 'conflict' | 'validation' | 'server'
  | 'unexpected' | 'reconciliation' | 'identity' | 'persistence'

export interface MutationSyncError {
  readonly kind: MutationSyncErrorKind
  readonly message: string
  readonly retryable: boolean
}

export type MutationSyncState =
  | { readonly state: 'pending'; readonly error: null }
  | { readonly state: 'syncing'; readonly error: null }
  | { readonly state: 'failed'; readonly error: Readonly<MutationSyncError> }

interface GroupsState {
  groups: Group[]
  participants: Participant[]
  expenses: Expense[]
  pendingMutations: PendingMutation[]
  mutationSync: Record<string, MutationSyncState>
  syncedGroups: Record<string, true>
}

interface HydratedGroupsState {
  readonly groups: Group[]
  readonly participants: Participant[]
  readonly pendingMutations: PendingMutation[]
  readonly expenses?: Expense[]
}

export const useGroupsStore = defineStore('groups', {
  state: (): GroupsState => ({
    groups: [], participants: [], expenses: [], pendingMutations: [], mutationSync: {}, syncedGroups: {},
  }),

  getters: {
    pendingCreateGroups: state => state.pendingMutations.filter(
      (mutation): mutation is PendingCreateGroup => mutation.type === 'CreateGroup',
    ),
    createGroupSync: state => Object.fromEntries(state.groups.map(group => {
      const mutations = state.pendingMutations.filter(item => item.groupId === group.id)
        .sort((left, right) => left.createdOrder - right.createdOrder)
      const failed = mutations.find(item => state.mutationSync[item.id]?.state === 'failed')
      const syncing = mutations.find(item => state.mutationSync[item.id]?.state === 'syncing')
      const current = failed ? state.mutationSync[failed.id] : syncing ? state.mutationSync[syncing.id]
        : mutations.length ? { state: 'pending' as const, error: null } : state.syncedGroups[group.id]
          ? { state: 'synced' as const, error: null } : undefined
      return [group.id, current]
    })),
  },

  actions: {
    hydrate(state: HydratedGroupsState): void {
      this.$patch({
        groups: state.groups,
        participants: state.participants,
        expenses: state.expenses ?? [],
        pendingMutations: state.pendingMutations,
        mutationSync: Object.fromEntries(state.pendingMutations.map(mutation => [
          mutation.id, { state: 'pending' as const, error: null },
        ])),
        syncedGroups: {},
      })
    },

    commitCreation(
      creation: PreparedGroupCreation,
      mutation?: PendingCreateGroup,
    ): void {
      if (this.groups.some(group => group.id === creation.group.id)) return
      mutation ??= prepareCreateGroupMutation(creation.payload, this.pendingMutations)
      this.groups.push(creation.group)
      if (creation.participant) this.participants.push(creation.participant)
      this.queueMutation(mutation)
    },

    commitParticipantAdd(group: Group, participant: Participant, mutation: PendingMutation): void {
      this.groups = this.groups.map(item => item.id === group.id ? group : item)
      this.participants.push(participant)
      this.queueMutation(mutation)
    },

    commitParticipantUpdate(participant: Participant, mutation: PendingMutation): void {
      this.participants = this.participants.map(item => item.id === participant.id ? participant : item)
      this.queueMutation(mutation)
    },

    commitParticipantDelete(group: Group, participantId: string, mutation: PendingMutation): void {
      this.groups = this.groups.map(item => item.id === group.id ? group : item)
      this.participants = this.participants.filter(item => item.id !== participantId)
      this.queueMutation(mutation)
    },

    commitExpenseSave(group: Group, expense: Expense, mutation: PendingMutation): void {
      this.groups = this.groups.map(item => item.id === group.id ? group : item)
      this.expenses = [...this.expenses.filter(item => item.id !== expense.id), expense]
      this.queueMutation(mutation)
    },

    commitExpenseDelete(expenseId: string, mutation: PendingMutation): void {
      this.expenses = this.expenses.filter(item => item.id !== expenseId)
      this.queueMutation(mutation)
    },

    expensesForGroup(groupId: string): Expense[] {
      return this.expenses.filter(expense => expense.groupId === groupId)
        .sort((left, right) => right.incurredOn.localeCompare(left.incurredOn))
    },

    queueMutation(mutation: PendingMutation): void {
      this.pendingMutations.push(mutation)
      this.mutationSync[mutation.id] = { state: 'pending', error: null }
    },

    findGroup(groupId: string): Group | undefined {
      return this.groups.find(group => group.id === groupId)
    },

    participantsForGroup(groupId: string): Participant[] {
      return this.participants.filter(participant => participant.groupId === groupId)
        .sort((left, right) => left.order - right.order)
    },

    findPendingCreate(groupId: string): PendingCreateGroup | undefined {
      return this.pendingCreateGroups.find(mutation => mutation.groupId === groupId)
    },

    hasPendingCreate(groupId: string): boolean {
      return Boolean(this.findPendingCreate(groupId))
    },

    beginMutationSync(mutationId: string): PendingMutation | null {
      const mutation = this.pendingMutations.find(item => item.id === mutationId)
      if (!mutation || this.mutationSync[mutationId]?.state === 'syncing') return null
      const groupHead = this.pendingMutations
        .filter(item => item.groupId === mutation.groupId)
        .sort((left, right) => left.createdOrder - right.createdOrder)[0]
      if (groupHead?.id !== mutation.id) return null
      this.mutationSync[mutationId] = { state: 'syncing', error: null }
      return mutation
    },

    failMutationSync(mutationId: string, error: MutationSyncError): void {
      if (!this.pendingMutations.some(item => item.id === mutationId)) return
      this.mutationSync[mutationId] = { state: 'failed', error: Object.freeze({ ...error }) }
    },

    confirmMutationSync(mutationId: string): void {
      const mutation = this.pendingMutations.find(item => item.id === mutationId)
      if (!mutation) return
      this.pendingMutations = this.pendingMutations.filter(item => item.id !== mutationId)
      delete this.mutationSync[mutationId]
      if (mutation.type === 'CreateGroup') this.syncedGroups[mutation.groupId] = true
    },

    groupSyncState(groupId: string): MutationSyncState | { state: 'synced'; error: null } | undefined {
      const mutations = this.pendingMutations
        .filter(mutation => mutation.groupId === groupId)
        .sort((left, right) => left.createdOrder - right.createdOrder)
      const failed = mutations.find(mutation => this.mutationSync[mutation.id]?.state === 'failed')
      if (failed) return this.mutationSync[failed.id]
      const syncing = mutations.find(mutation => this.mutationSync[mutation.id]?.state === 'syncing')
      if (syncing) return this.mutationSync[syncing.id]
      if (mutations.length) return { state: 'pending', error: null }
      if (this.syncedGroups[groupId]) return { state: 'synced', error: null }
    },
  },
})

export type PendingCreateGroupMutation = PendingCreateGroup
export type CreateGroupSyncError = MutationSyncError
