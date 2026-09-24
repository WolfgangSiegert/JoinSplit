import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Group, Participant, PreparedGroupCreation } from '../domain/create-group'
import type { PendingCreateGroup, PendingMutation, PendingAddParticipant, PendingRenameParticipant, PendingDeactivateParticipant, PendingDeleteParticipant, PendingArchiveGroup, PendingReactivateGroup, PendingDeleteGroup } from '../domain/pending-mutation'
import type { Expense, ExpenseShare } from '../domain/expense'
import type { DurableSettlementSnapshot } from '../domain/settlement'

export const DATABASE_NAME = 'joinsplit'
export const DATABASE_VERSION = 4
const ACCESS_IDENTITY_KEY = 'current'
const SETTINGS_KEY = 'preferences'

export interface DurableAccessIdentity { readonly id: string; readonly credential: string }
export interface DurableSettings {
  readonly addSelfAsParticipantByDefault: boolean
  readonly settlementProposalStrategy: 'deterministic' | 'minimum-transfer'
}
interface AccessIdentityRecord extends DurableAccessIdentity { readonly key: typeof ACCESS_IDENTITY_KEY }
interface SettingsRecord extends DurableSettings { readonly key: typeof SETTINGS_KEY }
interface JoinSplitDatabase extends DBSchema {
  accessIdentity: { key: string; value: AccessIdentityRecord }
  groups: { key: string; value: Group }
  participants: { key: string; value: Participant }
  pendingMutations: { key: string; value: PendingMutation }
  settings: { key: string; value: SettingsRecord }
  expenses: { key: string; value: Omit<Expense, 'shares'> }
  expenseShares: { key: [string, string]; value: ExpenseShare & { readonly expenseId: string } }
  settlements: { key: string; value: DurableSettlementSnapshot }
}

interface LegacyCreateGroupRecord {
  readonly groupId: string
  readonly kind: 'CreateGroup'
  readonly payload: PendingCreateGroup['payload']
  readonly status: 'pending'
}

export function migrateLegacyCreateGroupRecords(
  records: readonly LegacyCreateGroupRecord[],
  generateId: () => string = () => crypto.randomUUID(),
): PendingCreateGroup[] {
  return [...records].sort((a, b) => a.groupId.localeCompare(b.groupId)).map((record, createdOrder) => Object.freeze({
    id: generateId(), type: 'CreateGroup' as const, groupId: record.groupId, createdOrder,
    payload: Object.freeze({ ...record.payload, initialParticipant: record.payload.initialParticipant
      ? Object.freeze({ ...record.payload.initialParticipant }) : null }),
  }))
}

export interface DurableState {
  readonly accessIdentity: DurableAccessIdentity | null
  readonly groups: Group[]
  readonly participants: Participant[]
  readonly pendingMutations: PendingMutation[]
  readonly expenses: Expense[]
  readonly settlements: DurableSettlementSnapshot[]
  readonly settings: DurableSettings | null
}

let databasePromise: Promise<IDBPDatabase<JoinSplitDatabase>> | undefined

function database(): Promise<IDBPDatabase<JoinSplitDatabase>> {
  databasePromise ??= openDB<JoinSplitDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore('accessIdentity', { keyPath: 'key' })
        db.createObjectStore('groups', { keyPath: 'id' })
        db.createObjectStore('participants', { keyPath: 'id' })
        db.createObjectStore('pendingMutations', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
      } else if (oldVersion === 1) {
        const request = transaction.objectStore('pendingMutations').getAll()
        request.then(records => {
          try {
            const mutations = migrateLegacyCreateGroupRecords(records as unknown as LegacyCreateGroupRecord[])
            db.deleteObjectStore('pendingMutations')
            const upgraded = db.createObjectStore('pendingMutations', { keyPath: 'id' })
            for (const mutation of mutations) upgraded.add(mutation)
          } catch (error) {
            transaction.abort()
            throw error
          }
        })
      }
      if (oldVersion < 3) {
        db.createObjectStore('expenses', { keyPath: 'id' })
        db.createObjectStore('expenseShares', { keyPath: ['expenseId', 'participantId'] })
        const groups = transaction.objectStore('groups')
        void groups.openCursor().then(function migrate(cursor): Promise<void> | void {
          if (!cursor) return
          const value = cursor.value as Group & { hasFinancialHistory?: boolean }
          if (typeof value.hasFinancialHistory !== 'boolean') cursor.update({ ...value, hasFinancialHistory: false })
          return cursor.continue().then(migrate)
        })
      }
      if (oldVersion < 4) {
        db.createObjectStore('settlements', { keyPath: 'id' })
        const settings = transaction.objectStore('settings')
        void settings.openCursor().then(function migrate(cursor): Promise<void> | void {
          if (!cursor) return
          const value = cursor.value as SettingsRecord & { settlementProposalStrategy?: DurableSettings['settlementProposalStrategy'] }
          if (value.settlementProposalStrategy !== 'deterministic' && value.settlementProposalStrategy !== 'minimum-transfer') {
            cursor.update({ ...value, settlementProposalStrategy: 'deterministic' })
          }
          return cursor.continue().then(migrate)
        })
      }
    },
  })
  return databasePromise
}

export async function loadDurableState(): Promise<DurableState> {
  const db = await database()
  const tx = db.transaction(['accessIdentity', 'groups', 'participants', 'pendingMutations', 'settings', 'expenses', 'expenseShares', 'settlements'], 'readonly')
  const [identities, groups, participants, pendingMutations, settingsRecords, expenseRecords, expenseShares, settlements] = await Promise.all([
    tx.objectStore('accessIdentity').getAll(), tx.objectStore('groups').getAll(),
    tx.objectStore('participants').getAll(), tx.objectStore('pendingMutations').getAll(),
    tx.objectStore('settings').getAll(), tx.objectStore('expenses').getAll(), tx.objectStore('expenseShares').getAll(), tx.objectStore('settlements').getAll(),
  ])
  await tx.done
  if (identities.length > 1 || settingsRecords.length > 1) throw new Error('Invalid persistence singleton records')
  const identity = identities[0]
  const settings = settingsRecords[0]
  const participantOrder = new Map(participants.map(participant => [participant.id, participant.order]))
  return {
    accessIdentity: identity ? { id: identity.id, credential: identity.credential } : null,
    groups, participants, pendingMutations,
    expenses: expenseRecords.map(expense => ({
      ...expense,
      shares: expenseShares
        .filter(share => share.expenseId === expense.id)
        .sort((left, right) => (participantOrder.get(left.participantId) ?? Number.MAX_SAFE_INTEGER)
          - (participantOrder.get(right.participantId) ?? Number.MAX_SAFE_INTEGER))
        .map(({ participantId, amountMinor }) => ({ participantId, amountMinor })),
    })),
    settlements,
    settings: settings ? {
      addSelfAsParticipantByDefault: settings.addSelfAsParticipantByDefault,
      settlementProposalStrategy: settings.settlementProposalStrategy,
    } : null,
  }
}

export async function persistSettlementSave(group: Group, settlement: DurableSettlementSnapshot, mutation: PendingMutation): Promise<void> {
  const db = await database(); const tx = db.transaction(['groups', 'settlements', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('groups').put(group), tx.objectStore('settlements').put(settlement), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

export async function persistSettlementDelete(settlementId: string, mutation: PendingMutation): Promise<void> {
  const db = await database(); const tx = db.transaction(['settlements', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('settlements').delete(settlementId), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

function expenseRecord(expense: Expense): Omit<Expense, 'shares'> {
  const { shares: _shares, ...record } = expense
  return record
}

export async function persistExpenseSave(group: Group, expense: Expense, mutation: PendingMutation): Promise<void> {
  const db = await database(); const tx = db.transaction(['groups', 'expenses', 'expenseShares', 'pendingMutations'], 'readwrite')
  await tx.objectStore('groups').put(group)
  await tx.objectStore('expenses').put(expenseRecord(expense))
  const shareStore = tx.objectStore('expenseShares')
  const existing = await shareStore.getAllKeys()
  await Promise.all(existing.filter(key => key[0] === expense.id).map(key => shareStore.delete(key)))
  await Promise.all(expense.shares.map(share => shareStore.put({ expenseId: expense.id, ...share })))
  await tx.objectStore('pendingMutations').add(mutation)
  await tx.done
}

export async function persistExpenseDelete(expense: Expense, mutation: PendingMutation): Promise<void> {
  const db = await database(); const tx = db.transaction(['expenses', 'expenseShares', 'pendingMutations'], 'readwrite')
  await tx.objectStore('expenses').delete(expense.id)
  const keys = await tx.objectStore('expenseShares').getAllKeys()
  await Promise.all(keys.filter(key => key[0] === expense.id).map(key => tx.objectStore('expenseShares').delete(key)))
  await tx.objectStore('pendingMutations').add(mutation)
  await tx.done
}

export async function persistAccessIdentity(identity: DurableAccessIdentity): Promise<void> {
  const db = await database(); await db.put('accessIdentity', { key: ACCESS_IDENTITY_KEY, ...identity })
}

export async function persistGroupCreation(creation: PreparedGroupCreation, mutation: PendingCreateGroup): Promise<void> {
  const db = await database(); const tx = db.transaction(['groups', 'participants', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('groups').add(creation.group), creation.participant
    ? tx.objectStore('participants').add(creation.participant) : Promise.resolve(), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

export async function persistParticipantAdd(group: Group, participant: Participant, mutation: PendingAddParticipant): Promise<void> {
  const db = await database(); const tx = db.transaction(['groups', 'participants', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('groups').put(group), tx.objectStore('participants').add(participant), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

export async function persistParticipantUpdate(participant: Participant, mutation: PendingRenameParticipant | PendingDeactivateParticipant): Promise<void> {
  const db = await database(); const tx = db.transaction(['participants', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('participants').put(participant), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

export async function persistParticipantDelete(group: Group, participantId: string, mutation: PendingDeleteParticipant): Promise<void> {
  const db = await database(); const tx = db.transaction(['groups', 'participants', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('groups').put(group), tx.objectStore('participants').delete(participantId), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

export async function persistGroupStatus(
  group: Group,
  mutation: PendingArchiveGroup | PendingReactivateGroup,
): Promise<void> {
  const db = await database(); const tx = db.transaction(['groups', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('groups').put(group), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

export async function persistGroupDeleteRequest(mutation: PendingDeleteGroup): Promise<void> {
  const db = await database(); const tx = db.transaction('pendingMutations', 'readwrite')
  await tx.store.add(mutation); await tx.done
}

export async function acknowledgeGroupDelete(group: Group, mutationId: string): Promise<void> {
  const db = await database(); const tx = db.transaction(['groups', 'participants', 'pendingMutations'], 'readwrite')
  await Promise.all([
    tx.objectStore('groups').delete(group.id),
    ...group.participantIds.map(participantId => tx.objectStore('participants').delete(participantId)),
    tx.objectStore('pendingMutations').delete(mutationId),
  ])
  await tx.done
}

export async function removePendingMutation(mutationId: string): Promise<void> {
  const db = await database(); const tx = db.transaction('pendingMutations', 'readwrite')
  await tx.store.delete(mutationId); await tx.done
}

export async function persistSettings(settings: DurableSettings): Promise<void> {
  const db = await database(); await db.put('settings', { key: SETTINGS_KEY, ...settings })
}
