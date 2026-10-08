export type GroupStatus = 'active' | 'archived';
export type ParticipantStatus = 'active' | 'inactive';
export type SettlementStrategy = 'deterministic' | 'minimum-transfer';

export interface AccessIdentity {
  readonly id: string;
  readonly credential: string;
  readonly registered: boolean;
}
export interface Group {
  readonly id: string;
  readonly name: string;
  readonly currency: 'EUR';
  readonly ownerAccessIdentityId: string;
  readonly status: GroupStatus;
  readonly hasFinancialHistory: boolean;
  readonly participantIds: readonly string[];
}
export interface Participant {
  readonly id: string;
  readonly groupId: string;
  readonly name: string;
  readonly status: ParticipantStatus;
  readonly order: number;
}
export interface ExpenseShare {
  readonly participantId: string;
  readonly amountMinor: number;
}
export interface Expense {
  readonly id: string;
  readonly groupId: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly incurredOn: string;
  readonly payerParticipantId: string;
  readonly creatorAccessIdentityId: string;
  readonly splitMethod: 'equal';
  readonly shares: readonly ExpenseShare[];
}
export interface Settlement {
  readonly id: string;
  readonly groupId: string;
  readonly senderParticipantId: string;
  readonly receiverParticipantId: string;
  readonly amountMinor: bigint;
  readonly occurredOn: string;
  readonly creatorAccessIdentityId: string;
}
export type MutationKind =
  | 'CreateGroup'
  | 'ArchiveGroup'
  | 'ReactivateGroup'
  | 'DeleteGroup'
  | 'AddParticipant'
  | 'RenameParticipant'
  | 'DeactivateParticipant'
  | 'ReactivateParticipant'
  | 'DeleteParticipant'
  | 'CreateExpense'
  | 'UpdateExpense'
  | 'DeleteExpense'
  | 'CreateSettlement'
  | 'UpdateSettlement'
  | 'DeleteSettlement';
export interface PendingMutation {
  readonly id: string;
  readonly groupId: string;
  readonly createdOrder: number;
  readonly type: MutationKind;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly syncState: 'pending' | 'syncing' | 'failed';
  readonly error?: string;
}
export interface WorkspaceSettings {
  readonly addSelfAsParticipantByDefault: boolean;
  readonly settlementProposalStrategy: SettlementStrategy;
}
export interface WorkspaceState {
  readonly groups: readonly Group[];
  readonly participants: readonly Participant[];
  readonly expenses: readonly Expense[];
  readonly settlements: readonly Settlement[];
  readonly pendingMutations: readonly PendingMutation[];
  readonly settings: WorkspaceSettings;
}
export const EMPTY_WORKSPACE: WorkspaceState = {
  groups: [],
  participants: [],
  expenses: [],
  settlements: [],
  pendingMutations: [],
  settings: { addSelfAsParticipantByDefault: true, settlementProposalStrategy: 'deterministic' },
};
export interface ParticipantBalance {
  readonly participantId: string;
  readonly paidAmountMinor: bigint;
  readonly shareAmountMinor: bigint;
  readonly sentSettlementAmountMinor: bigint;
  readonly receivedSettlementAmountMinor: bigint;
  readonly balanceAmountMinor: bigint;
}
