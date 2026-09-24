import type { CreateGroupPayload } from './create-group'
import type { Expense } from './expense'
import type { DurableSettlementSnapshot } from './settlement'

export interface PendingMutationBase {
  readonly id: string
  readonly groupId: string
  readonly createdOrder: number
}

export interface PendingCreateGroup extends PendingMutationBase {
  readonly type: 'CreateGroup'
  readonly payload: Readonly<CreateGroupPayload>
}

export interface AddParticipantPayload {
  readonly participantId: string
  readonly name: string
  readonly order: number
}

export interface PendingAddParticipant extends PendingMutationBase {
  readonly type: 'AddParticipant'
  readonly payload: Readonly<AddParticipantPayload>
}

export interface RenameParticipantPayload {
  readonly participantId: string
  readonly name: string
  readonly active: boolean
  readonly order: number
}

export interface PendingRenameParticipant extends PendingMutationBase {
  readonly type: 'RenameParticipant'
  readonly payload: Readonly<RenameParticipantPayload>
}

export interface DeactivateParticipantPayload {
  readonly participantId: string
  readonly name: string
  readonly active: false
  readonly order: number
}

export interface PendingDeactivateParticipant extends PendingMutationBase {
  readonly type: 'DeactivateParticipant'
  readonly payload: Readonly<DeactivateParticipantPayload>
}

export interface PendingDeleteParticipant extends PendingMutationBase {
  readonly type: 'DeleteParticipant'
  readonly payload: Readonly<{ readonly participantId: string }>
}

export interface PendingCreateExpense extends PendingMutationBase {
  readonly type: 'CreateExpense'
  readonly payload: Readonly<{ readonly expense: Readonly<Expense> }>
}

export interface PendingUpdateExpense extends PendingMutationBase {
  readonly type: 'UpdateExpense'
  readonly payload: Readonly<{ readonly expense: Readonly<Expense> }>
}

export interface PendingDeleteExpense extends PendingMutationBase {
  readonly type: 'DeleteExpense'
  readonly payload: Readonly<{ readonly expense: Readonly<Expense> }>
}

export interface PendingCreateSettlement extends PendingMutationBase {
  readonly type: 'CreateSettlement'
  readonly payload: Readonly<{ readonly settlement: Readonly<DurableSettlementSnapshot> }>
}

export interface PendingUpdateSettlement extends PendingMutationBase {
  readonly type: 'UpdateSettlement'
  readonly payload: Readonly<{ readonly settlement: Readonly<DurableSettlementSnapshot> }>
}

export interface PendingDeleteSettlement extends PendingMutationBase {
  readonly type: 'DeleteSettlement'
  readonly payload: Readonly<{ readonly settlement: Readonly<DurableSettlementSnapshot> }>
}

export type PendingMutation =
  | PendingCreateGroup
  | PendingAddParticipant
  | PendingRenameParticipant
  | PendingDeactivateParticipant
  | PendingDeleteParticipant
  | PendingCreateExpense
  | PendingUpdateExpense
  | PendingDeleteExpense
  | PendingCreateSettlement
  | PendingUpdateSettlement
  | PendingDeleteSettlement

export function nextCreatedOrder(mutations: readonly PendingMutation[]): number {
  return mutations.reduce((maximum, mutation) => Math.max(maximum, mutation.createdOrder), -1) + 1
}

export function sortPendingMutations(mutations: readonly PendingMutation[]): PendingMutation[] {
  return [...mutations].sort((left, right) => left.createdOrder - right.createdOrder)
}

export function freezePendingMutation<T extends PendingMutation>(mutation: T): Readonly<T> {
  if (mutation.type === 'CreateGroup' && mutation.payload.initialParticipant) {
    Object.freeze(mutation.payload.initialParticipant)
  }
  if (mutation.type === 'CreateExpense' || mutation.type === 'UpdateExpense' || mutation.type === 'DeleteExpense') {
    for (const share of mutation.payload.expense.shares) Object.freeze(share)
    Object.freeze(mutation.payload.expense.shares)
    Object.freeze(mutation.payload.expense)
  }
  if (mutation.type === 'CreateSettlement' || mutation.type === 'UpdateSettlement' || mutation.type === 'DeleteSettlement') {
    Object.freeze(mutation.payload.settlement)
  }
  Object.freeze(mutation.payload)
  return Object.freeze(mutation)
}

export function restorePendingMutation(mutation: PendingMutation): PendingMutation {
  if (mutation.type === 'CreateGroup') {
    return freezePendingMutation({
      ...mutation,
      payload: {
        ...mutation.payload,
        initialParticipant: mutation.payload.initialParticipant
          ? { ...mutation.payload.initialParticipant }
          : null,
      },
    })
  }
  if (mutation.type === 'CreateExpense' || mutation.type === 'UpdateExpense' || mutation.type === 'DeleteExpense') {
    return freezePendingMutation({
      ...mutation,
      payload: { expense: { ...mutation.payload.expense, shares: mutation.payload.expense.shares.map(share => ({ ...share })) } },
    })
  }
  if (mutation.type === 'CreateSettlement' || mutation.type === 'UpdateSettlement' || mutation.type === 'DeleteSettlement') {
    return freezePendingMutation({ ...mutation, payload: { settlement: { ...mutation.payload.settlement } } })
  }
  return freezePendingMutation({ ...mutation, payload: { ...mutation.payload } } as PendingMutation)
}

export function prepareCreateGroupMutation(
  payload: Readonly<CreateGroupPayload>,
  mutations: readonly PendingMutation[],
  generateId: () => string = () => crypto.randomUUID(),
  createdOrder: number = nextCreatedOrder(mutations),
): Readonly<PendingCreateGroup> {
  return freezePendingMutation({
    id: generateId(),
    type: 'CreateGroup',
    groupId: payload.groupId,
    createdOrder,
    payload,
  })
}
