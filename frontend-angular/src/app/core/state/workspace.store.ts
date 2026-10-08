import { computed, inject, Injectable, signal } from '@angular/core';
import {
  assessSettlement,
  calculateBalances,
  calculateEqualShares,
  isCalendarDate,
  normalizeName,
  parseAmountMinor,
  parseSettlementAmountMinor,
  participantHasFinancialReferences,
  validName,
} from '../domain/ledger';
import {
  AccessIdentity,
  EMPTY_WORKSPACE,
  Expense,
  Group,
  Participant,
  PendingMutation,
  Settlement,
  SettlementStrategy,
  WorkspaceState,
} from '../domain/models';
import { WorkspaceRepository } from '../persistence/workspace.repository';

interface GroupDraft {
  groupName: string;
  addParticipant: boolean;
  participantName: string;
}
interface ExpenseDraft {
  description: string;
  amount: string;
  incurredOn: string;
  payerParticipantId: string;
  participantIds: readonly string[];
}
interface SettlementDraft {
  senderParticipantId: string;
  receiverParticipantId: string;
  amount: string;
  occurredOn: string;
}

export class SettlementConfirmationError extends Error {
  constructor(readonly reasons: readonly ('wrong_direction' | 'exceeds_open_amount')[]) {
    super('Diese Zahlung weicht vom aktuellen offenen Saldo ab.');
  }
}

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly repository = inject(WorkspaceRepository);
  private readonly stateSignal = signal<WorkspaceState>(EMPTY_WORKSPACE);
  private readonly identitySignal = signal<AccessIdentity | null>(null);
  private writeQueue: Promise<void> = Promise.resolve();

  readonly state = this.stateSignal.asReadonly();
  readonly identity = this.identitySignal.asReadonly();
  readonly loadError = signal('');
  readonly groups = computed(() => this.stateSignal().groups);
  readonly activeGroups = computed(() =>
    this.stateSignal().groups.filter((group) => group.status === 'active'),
  );
  readonly archivedGroups = computed(() =>
    this.stateSignal().groups.filter((group) => group.status === 'archived'),
  );
  readonly pendingCount = computed(() => this.stateSignal().pendingMutations.length);
  readonly settings = computed(() => this.stateSignal().settings);

  async initialize(): Promise<void> {
    try {
      const loaded = await this.repository.load();
      this.identitySignal.set(loaded.identity);
      this.stateSignal.set(loaded.workspace);
    } catch {
      this.loadError.set(
        'Die vorhandene IndexedDB wurde nicht verändert. Prüfe den Browser-Speicher und lade danach neu.',
      );
    }
  }

  group(groupId: string): Group | undefined {
    return this.stateSignal().groups.find((group) => group.id === groupId);
  }
  participantsForGroup(groupId: string): Participant[] {
    return this.stateSignal()
      .participants.filter((item) => item.groupId === groupId)
      .sort((a, b) => a.order - b.order);
  }
  expensesForGroup(groupId: string): Expense[] {
    return this.stateSignal()
      .expenses.filter((item) => item.groupId === groupId)
      .sort((a, b) => b.incurredOn.localeCompare(a.incurredOn));
  }
  settlementsForGroup(groupId: string): Settlement[] {
    return this.stateSignal()
      .settlements.filter((item) => item.groupId === groupId)
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  }
  expense(expenseId: string): Expense | undefined {
    return this.stateSignal().expenses.find((item) => item.id === expenseId);
  }
  settlement(settlementId: string): Settlement | undefined {
    return this.stateSignal().settlements.find((item) => item.id === settlementId);
  }

  createGroup(draft: GroupDraft): Promise<string> {
    return this.write(async (state, identity) => {
      const name = normalizeName(draft.groupName);
      const participantName = normalizeName(draft.participantName);
      if (!validName(name)) throw new Error('Der Gruppenname muss 1 bis 100 Zeichen lang sein.');
      if (draft.addParticipant && !validName(participantName))
        throw new Error('Der Teilnehmername muss 1 bis 100 Zeichen lang sein.');
      const actor = identity ?? createIdentity();
      const groupId = crypto.randomUUID();
      const participantId = draft.addParticipant ? crypto.randomUUID() : null;
      const group: Group = {
        id: groupId,
        name,
        currency: 'EUR',
        ownerAccessIdentityId: actor.id,
        status: 'active',
        hasFinancialHistory: false,
        participantIds: participantId ? [participantId] : [],
      };
      const participant: Participant | null = participantId
        ? { id: participantId, groupId, name: participantName, status: 'active', order: 0 }
        : null;
      const payload = {
        groupId,
        name,
        currency: 'EUR',
        actorId: actor.id,
        initialParticipant: participantId ? { participantId, name: participantName } : null,
      };
      const mutation = pending('CreateGroup', groupId, payload, state);
      const next = {
        ...state,
        groups: [...state.groups, group],
        participants: participant ? [...state.participants, participant] : state.participants,
        pendingMutations: [...state.pendingMutations, mutation],
      };
      return { state: next, identity: actor, result: groupId };
    });
  }

  addParticipant(groupId: string, rawName: string): Promise<string> {
    return this.write(async (state, identity) => {
      const group = requireGroup(state, groupId);
      const name = normalizeName(rawName);
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      if (!validName(name)) throw new Error('Der Name muss 1 bis 100 Zeichen lang sein.');
      const groupParticipants = state.participants.filter((item) => item.groupId === groupId);
      if (
        groupParticipants.some(
          (item) => item.name.toLocaleLowerCase('de-DE') === name.toLocaleLowerCase('de-DE'),
        )
      )
        throw new Error('In dieser Gruppe existiert bereits ein Teilnehmer mit diesem Namen.');
      const participant: Participant = {
        id: crypto.randomUUID(),
        groupId,
        name,
        status: 'active',
        order: Math.max(-1, ...groupParticipants.map((item) => item.order)) + 1,
      };
      const updatedGroup = { ...group, participantIds: [...group.participantIds, participant.id] };
      const mutation = pending(
        'AddParticipant',
        groupId,
        { participantId: participant.id, name, order: participant.order },
        state,
      );
      return {
        state: {
          ...state,
          groups: replace(state.groups, updatedGroup),
          participants: [...state.participants, participant],
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: participant.id,
      };
    });
  }

  renameParticipant(participantId: string, rawName: string): Promise<void> {
    return this.write(async (state, identity) => {
      const participant = requireParticipant(state, participantId);
      const group = requireGroup(state, participant.groupId);
      const name = normalizeName(rawName);
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      if (!validName(name)) throw new Error('Der Name muss 1 bis 100 Zeichen lang sein.');
      if (
        state.participants.some(
          (item) =>
            item.groupId === group.id &&
            item.id !== participantId &&
            item.name.toLocaleLowerCase('de-DE') === name.toLocaleLowerCase('de-DE'),
        )
      )
        throw new Error('In dieser Gruppe existiert bereits ein Teilnehmer mit diesem Namen.');
      const mutation = pending(
        'RenameParticipant',
        group.id,
        {
          participantId,
          name,
          active: participant.status === 'active',
          order: participant.order,
        },
        state,
      );
      return {
        state: {
          ...state,
          participants: replace(state.participants, { ...participant, name }),
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: undefined,
      };
    });
  }

  setParticipantActive(participantId: string, active: boolean): Promise<void> {
    return this.write(async (state, identity) => {
      const participant = requireParticipant(state, participantId);
      const group = requireGroup(state, participant.groupId);
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      const mutation = pending(
        active ? 'ReactivateParticipant' : 'DeactivateParticipant',
        group.id,
        {
          participantId,
          name: participant.name,
          active,
          order: participant.order,
        },
        state,
      );
      return {
        state: {
          ...state,
          participants: replace(state.participants, {
            ...participant,
            status: active ? ('active' as const) : ('inactive' as const),
          }),
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: undefined,
      };
    });
  }

  deleteParticipant(participantId: string): Promise<void> {
    return this.write(async (state, identity) => {
      const participant = requireParticipant(state, participantId);
      const group = requireGroup(state, participant.groupId);
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      if (participantHasFinancialReferences(participantId, state.expenses, state.settlements))
        throw new Error('Teilnehmer mit Finanzbezug können nur deaktiviert werden.');
      const mutation = pending('DeleteParticipant', group.id, { participantId }, state);
      return {
        state: {
          ...state,
          groups: replace(state.groups, {
            ...group,
            participantIds: group.participantIds.filter((id) => id !== participantId),
          }),
          participants: state.participants.filter((item) => item.id !== participantId),
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: undefined,
      };
    });
  }

  saveExpense(groupId: string, draft: ExpenseDraft, existingId?: string): Promise<string> {
    return this.write(async (state, identity) => {
      const actor = requireIdentity(identity);
      const group = requireGroup(state, groupId);
      const existing = existingId
        ? state.expenses.find((item) => item.id === existingId && item.groupId === groupId)
        : undefined;
      if (existingId && !existing) throw new Error('Ausgabe nicht gefunden.');
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      const description = normalizeName(draft.description);
      const amountMinor = parseAmountMinor(draft.amount);
      const participants = state.participants.filter((item) => item.groupId === groupId);
      if (!validName(description, 200))
        throw new Error('Die Beschreibung muss 1 bis 200 Zeichen lang sein.');
      if (amountMinor === null)
        throw new Error('Gib einen positiven Betrag mit höchstens zwei Nachkommastellen ein.');
      if (!isCalendarDate(draft.incurredOn)) throw new Error('Das Datum ist ungültig.');
      if (
        !participants.some(
          (item) =>
            item.id === draft.payerParticipantId &&
            (item.status === 'active' || item.id === existing?.payerParticipantId),
        )
      )
        throw new Error('Wähle einen aktiven zahlenden Teilnehmer.');
      const selectableIds = new Set([
        ...participants.filter((item) => item.status === 'active').map((item) => item.id),
        ...(existing?.shares.map((share) => share.participantId) ?? []),
      ]);
      const shares = calculateEqualShares(
        amountMinor,
        draft.participantIds,
        participants.filter((item) => selectableIds.has(item.id)),
      );
      const expense: Expense = {
        id: existing?.id ?? crypto.randomUUID(),
        groupId,
        description,
        amountMinor,
        incurredOn: draft.incurredOn,
        payerParticipantId: draft.payerParticipantId,
        creatorAccessIdentityId: existing?.creatorAccessIdentityId ?? actor.id,
        splitMethod: 'equal',
        shares,
      };
      const updatedGroup = { ...group, hasFinancialHistory: true };
      const mutation = pending(
        existing ? 'UpdateExpense' : 'CreateExpense',
        groupId,
        { expense },
        state,
      );
      return {
        state: {
          ...state,
          groups: replace(state.groups, updatedGroup),
          expenses: existing ? replace(state.expenses, expense) : [...state.expenses, expense],
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: actor,
        result: expense.id,
      };
    });
  }

  deleteExpense(expenseId: string): Promise<void> {
    return this.write(async (state, identity) => {
      const expense = state.expenses.find((item) => item.id === expenseId);
      if (!expense) throw new Error('Ausgabe nicht gefunden.');
      const group = requireGroup(state, expense.groupId);
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      const mutation = pending('DeleteExpense', group.id, { expense }, state);
      return {
        state: {
          ...state,
          expenses: state.expenses.filter((item) => item.id !== expenseId),
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: undefined,
      };
    });
  }

  saveSettlement(
    groupId: string,
    draft: SettlementDraft,
    existingId?: string,
    confirmationAccepted = false,
  ): Promise<string> {
    return this.write(async (state, identity) => {
      const actor = requireIdentity(identity);
      const group = requireGroup(state, groupId);
      const existing = existingId
        ? state.settlements.find((item) => item.id === existingId && item.groupId === groupId)
        : undefined;
      if (existingId && !existing) throw new Error('Zahlung nicht gefunden.');
      const amountMinor = parseSettlementAmountMinor(draft.amount);
      const participants = state.participants.filter((item) => item.groupId === groupId);
      const byId = new Map(participants.map((item) => [item.id, item]));
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      if (
        !byId.has(draft.senderParticipantId) ||
        !byId.has(draft.receiverParticipantId) ||
        draft.senderParticipantId === draft.receiverParticipantId
      )
        throw new Error('Wähle zwei unterschiedliche Teilnehmer.');
      if (amountMinor === null)
        throw new Error('Gib einen positiven Betrag mit höchstens zwei Nachkommastellen ein.');
      if (!isCalendarDate(draft.occurredOn)) throw new Error('Das Datum ist ungültig.');
      const balances = new Map(
        calculateBalances(groupId, participants, state.expenses, state.settlements).map((item) => [
          item.participantId,
          item.balanceAmountMinor,
        ]),
      );
      if (existing) {
        balances.set(
          existing.senderParticipantId,
          balances.get(existing.senderParticipantId)! - existing.amountMinor,
        );
        balances.set(
          existing.receiverParticipantId,
          balances.get(existing.receiverParticipantId)! + existing.amountMinor,
        );
      }
      const assessment = assessSettlement(
        byId.get(draft.senderParticipantId)!,
        byId.get(draft.receiverParticipantId)!,
        amountMinor,
        balances,
      );
      if (assessment.decision === 'reject')
        throw new Error(
          'Mit inaktiven Teilnehmern darf eine Zahlung nur einen offenen Saldo in korrekter Richtung reduzieren.',
        );
      if (assessment.decision === 'confirm' && !confirmationAccepted)
        throw new SettlementConfirmationError(assessment.confirmationReasons);
      const settlement: Settlement = {
        id: existing?.id ?? crypto.randomUUID(),
        groupId,
        senderParticipantId: draft.senderParticipantId,
        receiverParticipantId: draft.receiverParticipantId,
        amountMinor,
        occurredOn: draft.occurredOn,
        creatorAccessIdentityId: existing?.creatorAccessIdentityId ?? actor.id,
      };
      const snapshot = { ...settlement, amountMinor: settlement.amountMinor.toString(10) };
      const mutation = pending(
        existing ? 'UpdateSettlement' : 'CreateSettlement',
        groupId,
        { settlement: snapshot },
        state,
      );
      return {
        state: {
          ...state,
          groups: replace(state.groups, { ...group, hasFinancialHistory: true }),
          settlements: existing
            ? replace(state.settlements, settlement)
            : [...state.settlements, settlement],
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: actor,
        result: settlement.id,
      };
    });
  }

  deleteSettlement(settlementId: string): Promise<void> {
    return this.write(async (state, identity) => {
      const settlement = state.settlements.find((item) => item.id === settlementId);
      if (!settlement) throw new Error('Zahlung nicht gefunden.');
      const group = requireGroup(state, settlement.groupId);
      if (group.status !== 'active') throw new Error('Archivierte Gruppen sind schreibgeschützt.');
      const snapshot = { ...settlement, amountMinor: settlement.amountMinor.toString(10) };
      const mutation = pending('DeleteSettlement', group.id, { settlement: snapshot }, state);
      return {
        state: {
          ...state,
          settlements: state.settlements.filter((item) => item.id !== settlementId),
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: undefined,
      };
    });
  }

  setGroupArchived(groupId: string, archived: boolean): Promise<void> {
    return this.write(async (state, identity) => {
      const group = requireGroup(state, groupId);
      if (archived && !group.hasFinancialHistory)
        throw new Error('Gruppen ohne Finanzhistorie werden gelöscht statt archiviert.');
      if (group.status === (archived ? 'archived' : 'active'))
        return { state, identity: requireIdentity(identity), result: undefined };
      const status = archived ? ('archived' as const) : ('active' as const);
      const mutation = pending(
        archived ? 'ArchiveGroup' : 'ReactivateGroup',
        groupId,
        { status },
        state,
      );
      return {
        state: {
          ...state,
          groups: replace(state.groups, { ...group, status }),
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: undefined,
      };
    });
  }

  deleteGroup(groupId: string): Promise<void> {
    return this.write(async (state, identity) => {
      const group = requireGroup(state, groupId);
      if (group.status !== 'active' || group.hasFinancialHistory)
        throw new Error('Nur aktive Gruppen ohne Finanzhistorie können gelöscht werden.');
      if (state.pendingMutations.some((item) => item.groupId === groupId))
        throw new Error('Die Gruppe muss vor dem Löschen synchronisiert sein.');
      const mutation = pending('DeleteGroup', groupId, {}, state);
      return {
        state: {
          ...state,
          groups: state.groups.filter((item) => item.id !== groupId),
          participants: state.participants.filter((item) => item.groupId !== groupId),
          pendingMutations: [...state.pendingMutations, mutation],
        },
        identity: requireIdentity(identity),
        result: undefined,
      };
    });
  }

  setStrategy(strategy: SettlementStrategy): Promise<void> {
    return this.write(async (state, identity) => ({
      state: { ...state, settings: { ...state.settings, settlementProposalStrategy: strategy } },
      identity: requireIdentity(identity),
      result: undefined,
    }));
  }
  markMutation(
    mutationId: string,
    syncState: PendingMutation['syncState'],
    error?: string,
  ): Promise<void> {
    return this.write(async (state, identity) => ({
      state: {
        ...state,
        pendingMutations: state.pendingMutations.map((item) =>
          item.id === mutationId ? { ...item, syncState, ...(error ? { error } : {}) } : item,
        ),
      },
      identity: requireIdentity(identity),
      result: undefined,
    }));
  }
  acknowledgeMutation(mutationId: string, identity: AccessIdentity): Promise<void> {
    return this.write(async (state) => ({
      state: {
        ...state,
        pendingMutations: state.pendingMutations.filter((item) => item.id !== mutationId),
      },
      identity,
      result: undefined,
    }));
  }
  updateIdentity(identity: AccessIdentity): Promise<void> {
    return this.write(async (state) => ({ state, identity, result: undefined }));
  }

  private write<T>(
    operation: (
      state: WorkspaceState,
      identity: AccessIdentity | null,
    ) => Promise<{ state: WorkspaceState; identity: AccessIdentity; result: T }>,
  ): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const change = await operation(this.stateSignal(), this.identitySignal());
      await this.repository.save(change.identity, change.state);
      this.identitySignal.set(change.identity);
      this.stateSignal.set(change.state);
      return change.result;
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function createIdentity(): AccessIdentity {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return {
    id: crypto.randomUUID(),
    credential: [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    registered: false,
  };
}
function requireIdentity(identity: AccessIdentity | null): AccessIdentity {
  if (!identity) throw new Error('Lokale Zugriffsidentität fehlt.');
  return identity;
}
function requireGroup(state: WorkspaceState, groupId: string): Group {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) throw new Error('Gruppe nicht gefunden.');
  return group;
}
function requireParticipant(state: WorkspaceState, participantId: string): Participant {
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant) throw new Error('Teilnehmer nicht gefunden.');
  return participant;
}
function replace<T extends { readonly id: string }>(items: readonly T[], value: T): T[] {
  return items.map((item) => (item.id === value.id ? value : item));
}
function pending(
  type: PendingMutation['type'],
  groupId: string,
  payload: Record<string, unknown>,
  state: WorkspaceState,
): PendingMutation {
  return {
    id: crypto.randomUUID(),
    groupId,
    createdOrder: Math.max(0, ...state.pendingMutations.map((item) => item.createdOrder + 1)),
    type,
    payload,
    syncState: 'pending',
  };
}
