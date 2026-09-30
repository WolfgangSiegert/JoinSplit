import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Group, Participant, PreparedGroupCreation } from '../domain/create-group'
import type { PendingCreateGroup, PendingMutation, PendingAddParticipant, PendingRenameParticipant, PendingDeactivateParticipant, PendingReactivateParticipant, PendingAssociateParticipant, PendingDeleteParticipant, PendingArchiveGroup, PendingReactivateGroup, PendingDeleteGroup } from '../domain/pending-mutation'
import type { Expense, ExpenseShare } from '../domain/expense'
import type { DurableSettlementSnapshot } from '../domain/settlement'
import type { Person } from '../domain/person'
import type { PendingPersonMutation } from '../domain/pending-person-mutation'
import { DEFAULT_GROUP_AREA_ORDER, isGroupAreaOrder, type GroupArea } from '../domain/group-area'
import { isLanguagePreference, type LanguagePreference } from '../domain/locale'

export const DATABASE_NAME = 'joinsplit'
export const DATABASE_VERSION = 10
const ACCESS_IDENTITY_KEY = 'current'
const ACCOUNT_WORKSPACE_KEY = 'current'
const ACCOUNT_ADOPTION_KEY = 'current'
const SETTINGS_KEY = 'preferences'

export interface DurableAccessIdentity {
  readonly id: string
  readonly credential: string | null
  readonly synchronizationStatus: 'never-synchronized' | 'registered' | 'expired-local-only' | 'account-linked'
}
export interface DurableAccountWorkspace {
  readonly accountId: string
  readonly name: string | null
  readonly email: string
  readonly accessIdentityIds: readonly string[]
  readonly groupRevisions: Readonly<Record<string, number>>
  readonly personRevisions: Readonly<Record<string, number>>
  readonly conflictedGroupIds: readonly string[]
  readonly lastSuccessfulSyncAt: string | null
}
export interface DurableAdoptionAttempt {
  readonly adoptionId: string
  readonly imports: readonly { readonly groupId: string; readonly importId: string; readonly snapshot: unknown }[]
  readonly peopleImport?: { readonly importId: string; readonly people: unknown; readonly associations: unknown }
}
export interface DurableSettings {
  readonly addSelfAsParticipantByDefault: boolean
  readonly defaultParticipantName: string
  readonly settlementProposalStrategy: 'deterministic' | 'minimum-transfer'
  readonly settlementRecordingEnabled: boolean
  readonly settlementRecordingGroupIds: readonly string[]
  readonly colorMode: 'system' | 'light' | 'dark'
  readonly visualDesign: '2' | '3' | '4' | '5'
  readonly groupAreaOrder: readonly GroupArea[]
  readonly languagePreference: LanguagePreference
}
interface AccessIdentityRecord extends DurableAccessIdentity { readonly key: typeof ACCESS_IDENTITY_KEY }
interface AccountWorkspaceRecord extends DurableAccountWorkspace { readonly key: typeof ACCOUNT_WORKSPACE_KEY }
interface AccountAdoptionRecord extends DurableAdoptionAttempt { readonly key: typeof ACCOUNT_ADOPTION_KEY }
interface SettingsRecord extends DurableSettings { readonly key: typeof SETTINGS_KEY }
interface JoinSplitDatabase extends DBSchema {
  accessIdentity: { key: string; value: AccessIdentityRecord }
  accountWorkspace: { key: string; value: AccountWorkspaceRecord }
  accountAdoption: { key: string; value: AccountAdoptionRecord }
  groups: { key: string; value: Group }
  participants: { key: string; value: Participant }
  people: { key: string; value: Person }
  pendingPersonMutations: { key: string; value: PendingPersonMutation }
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
  readonly accountWorkspace?: DurableAccountWorkspace | null
  readonly groups: Group[]
  readonly participants: Participant[]
  readonly people: Person[]
  readonly pendingPersonMutations: PendingPersonMutation[]
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
      if (oldVersion < 5) {
        const identities = transaction.objectStore('accessIdentity')
        void identities.openCursor().then(function migrate(cursor): Promise<void> | void {
          if (!cursor) return
          const value = cursor.value as AccessIdentityRecord & { synchronizationStatus?: DurableAccessIdentity['synchronizationStatus'] }
          if (!value.synchronizationStatus) cursor.update({ ...value, synchronizationStatus: 'registered' })
          return cursor.continue().then(migrate)
        })
      }
      if (oldVersion < 6) db.createObjectStore('accountWorkspace', { keyPath: 'key' })
      if (oldVersion < 7) db.createObjectStore('accountAdoption', { keyPath: 'key' })
      if (oldVersion < 8) db.createObjectStore('people', { keyPath: 'id' })
      if (oldVersion < 9) {
        const workspaces = transaction.objectStore('accountWorkspace')
        void workspaces.openCursor().then(function migrate(cursor): Promise<void> | void {
          if (!cursor) return
          const value = cursor.value as AccountWorkspaceRecord & { personRevisions?: Readonly<Record<string, number>> }
          if (!value.personRevisions) cursor.update({ ...value, personRevisions: {} })
          return cursor.continue().then(migrate)
        })
      }
      if (oldVersion < 10) db.createObjectStore('pendingPersonMutations', { keyPath: 'id' })
    },
  })
  return databasePromise
}

export async function loadDurableState(): Promise<DurableState> {
  const db = await database()
  const tx = db.transaction(['accessIdentity', 'accountWorkspace', 'groups', 'participants', 'people', 'pendingPersonMutations', 'pendingMutations', 'settings', 'expenses', 'expenseShares', 'settlements'], 'readonly')
  const [identities, accountWorkspaces, groups, participants, people, pendingPersonMutations, pendingMutations, settingsRecords, expenseRecords, expenseShares, settlements] = await Promise.all([
    tx.objectStore('accessIdentity').getAll(), tx.objectStore('accountWorkspace').getAll(), tx.objectStore('groups').getAll(),
    tx.objectStore('participants').getAll(), tx.objectStore('people').getAll(), tx.objectStore('pendingPersonMutations').getAll(), tx.objectStore('pendingMutations').getAll(),
    tx.objectStore('settings').getAll(), tx.objectStore('expenses').getAll(), tx.objectStore('expenseShares').getAll(), tx.objectStore('settlements').getAll(),
  ])
  await tx.done
  if (identities.length > 1 || accountWorkspaces.length > 1 || settingsRecords.length > 1) throw new Error('Invalid persistence singleton records')
  const identity = identities[0]
  const settings = settingsRecords[0] as (SettingsRecord & {
    defaultParticipantName?: string
    settlementRecordingEnabled?: boolean
    settlementRecordingGroupIds?: readonly string[]
    colorMode?: DurableSettings['colorMode']
    visualDesign?: DurableSettings['visualDesign']
    groupAreaOrder?: readonly GroupArea[]
    languagePreference?: LanguagePreference
  }) | undefined
  const participantOrder = new Map(participants.map(participant => [participant.id, participant.order]))
  return {
    accessIdentity: identity ? {
      id: identity.id,
      credential: identity.credential,
      synchronizationStatus: identity.synchronizationStatus,
    } : null,
    accountWorkspace: accountWorkspaces[0] ? {
      accountId: accountWorkspaces[0].accountId,
      name: typeof accountWorkspaces[0].name === 'string' ? accountWorkspaces[0].name : null,
      email: accountWorkspaces[0].email,
      accessIdentityIds: [...accountWorkspaces[0].accessIdentityIds],
      groupRevisions: { ...accountWorkspaces[0].groupRevisions },
      personRevisions: { ...accountWorkspaces[0].personRevisions },
      conflictedGroupIds: [...accountWorkspaces[0].conflictedGroupIds],
      lastSuccessfulSyncAt: typeof accountWorkspaces[0].lastSuccessfulSyncAt === 'string'
        ? accountWorkspaces[0].lastSuccessfulSyncAt : null,
    } : null,
    groups, participants, people, pendingPersonMutations, pendingMutations,
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
      defaultParticipantName: typeof settings.defaultParticipantName === 'string' ? settings.defaultParticipantName : '',
      settlementProposalStrategy: settings.settlementProposalStrategy,
      settlementRecordingEnabled: settings.settlementRecordingEnabled === true,
      settlementRecordingGroupIds: Array.isArray(settings.settlementRecordingGroupIds)
        ? [...new Set(settings.settlementRecordingGroupIds.filter(id => typeof id === 'string'))]
        : [],
      colorMode: settings.colorMode === 'light' || settings.colorMode === 'dark' ? settings.colorMode : 'system',
      visualDesign: settings.visualDesign === '3' || settings.visualDesign === '4' || settings.visualDesign === '5'
        ? settings.visualDesign
        : '2',
      groupAreaOrder: isGroupAreaOrder(settings.groupAreaOrder)
        ? [...settings.groupAreaOrder]
        : [...DEFAULT_GROUP_AREA_ORDER],
      languagePreference: isLanguagePreference(settings.languagePreference)
        ? settings.languagePreference
        : 'system',
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

export async function persistPerson(person: Person): Promise<void> {
  const db = await database(); await db.put('people', person)
}

export async function deletePerson(personId: string): Promise<void> {
  const db = await database(); await db.delete('people', personId)
}

export async function persistPersonMutation(person: Person, mutation: PendingPersonMutation): Promise<void> {
  const db = await database(); const tx = db.transaction(['people', 'pendingPersonMutations'], 'readwrite')
  await Promise.all([tx.objectStore('people').put(person), tx.objectStore('pendingPersonMutations').add(mutation)])
  await tx.done
}

export async function persistPersonDeleteMutation(personId: string, mutation: PendingPersonMutation): Promise<void> {
  const db = await database(); const tx = db.transaction(['people', 'pendingPersonMutations'], 'readwrite')
  await Promise.all([tx.objectStore('people').delete(personId), tx.objectStore('pendingPersonMutations').add(mutation)])
  await tx.done
}

export async function acknowledgePersonMutation(mutationId: string, personId: string, revision: number, deleted: boolean): Promise<void> {
  const db = await database(); const tx = db.transaction(['people', 'pendingPersonMutations', 'accountWorkspace'], 'readwrite')
  const person = await tx.objectStore('people').get(personId)
  if (person) await tx.objectStore('people').put({ ...person, revision })
  const workspace = await tx.objectStore('accountWorkspace').get(ACCOUNT_WORKSPACE_KEY)
  if (workspace) {
    const personRevisions = { ...workspace.personRevisions }
    if (deleted) delete personRevisions[personId]
    else personRevisions[personId] = revision
    await tx.objectStore('accountWorkspace').put({ ...workspace, personRevisions, lastSuccessfulSyncAt: new Date().toISOString() })
  }
  await tx.objectStore('pendingPersonMutations').delete(mutationId)
  await tx.done
}

export async function persistAccountWorkspace(workspace: DurableAccountWorkspace): Promise<void> {
  const db = await database(); await db.put('accountWorkspace', { key: ACCOUNT_WORKSPACE_KEY, ...workspace })
}

export async function loadAdoptionAttempt(): Promise<DurableAdoptionAttempt | null> {
  const db = await database(); const record = await db.get('accountAdoption', ACCOUNT_ADOPTION_KEY)
  return record ? {
    adoptionId: record.adoptionId,
    imports: record.imports.map(item => ({ ...item })),
    ...(record.peopleImport ? { peopleImport: { ...record.peopleImport } } : {}),
  } : null
}

export async function persistAdoptionAttempt(attempt: DurableAdoptionAttempt): Promise<void> {
  const db = await database(); await db.put('accountAdoption', { key: ACCOUNT_ADOPTION_KEY, ...attempt })
}

export async function clearAdoptionAttempt(): Promise<void> {
  const db = await database(); await db.delete('accountAdoption', ACCOUNT_ADOPTION_KEY)
}

export interface AccountHydration {
  readonly identity: DurableAccessIdentity
  readonly workspace: DurableAccountWorkspace
  readonly groups: readonly Group[]
  readonly participants: readonly Participant[]
  readonly people: readonly Person[]
  readonly expenses: readonly Expense[]
  readonly settlements: readonly DurableSettlementSnapshot[]
}

export async function replaceWithAccountHydration(hydration: AccountHydration): Promise<void> {
  const db = await database()
  const stores = ['accessIdentity', 'accountWorkspace', 'accountAdoption', 'groups', 'participants', 'people', 'pendingPersonMutations', 'pendingMutations', 'expenses', 'expenseShares', 'settlements'] as const
  const tx = db.transaction(stores, 'readwrite')
  await Promise.all(stores.map(store => tx.objectStore(store).clear()))
  await tx.objectStore('accessIdentity').put({ key: ACCESS_IDENTITY_KEY, ...hydration.identity })
  await tx.objectStore('accountWorkspace').put({ key: ACCOUNT_WORKSPACE_KEY, ...hydration.workspace })
  for (const group of hydration.groups) await tx.objectStore('groups').put(group)
  for (const participant of hydration.participants) await tx.objectStore('participants').put(participant)
  for (const person of hydration.people) await tx.objectStore('people').put(person)
  for (const expense of hydration.expenses) {
    await tx.objectStore('expenses').put(expenseRecord(expense))
    for (const share of expense.shares) await tx.objectStore('expenseShares').put({ expenseId: expense.id, ...share })
  }
  for (const settlement of hydration.settlements) await tx.objectStore('settlements').put(settlement)
  await tx.done
}

export async function clearAccountLocalData(): Promise<void> {
  const db = await database()
  const stores = ['accessIdentity', 'accountWorkspace', 'accountAdoption', 'groups', 'participants', 'people', 'pendingPersonMutations', 'pendingMutations', 'expenses', 'expenseShares', 'settlements'] as const
  const tx = db.transaction(stores, 'readwrite')
  await Promise.all(stores.map(store => tx.objectStore(store).clear()))
  await tx.done
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

export async function persistParticipantUpdate(participant: Participant, mutation: PendingRenameParticipant | PendingDeactivateParticipant | PendingReactivateParticipant | PendingAssociateParticipant): Promise<void> {
  const db = await database(); const tx = db.transaction(['participants', 'pendingMutations'], 'readwrite')
  await Promise.all([tx.objectStore('participants').put(participant), tx.objectStore('pendingMutations').add(mutation)])
  await tx.done
}

export async function persistParticipantAssociation(participant: Participant): Promise<void> {
  const db = await database(); await db.put('participants', participant)
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
  const db = await database(); const tx = db.transaction(['groups', 'participants', 'pendingMutations', 'expenses', 'expenseShares', 'settlements'], 'readwrite')
  const expenses = (await tx.objectStore('expenses').getAll()).filter(expense => expense.groupId === group.id)
  const expenseIds = new Set(expenses.map(expense => expense.id))
  const shares = (await tx.objectStore('expenseShares').getAll()).filter(share => expenseIds.has(share.expenseId))
  const settlements = (await tx.objectStore('settlements').getAll()).filter(settlement => settlement.groupId === group.id)
  await Promise.all([
    tx.objectStore('groups').delete(group.id),
    ...group.participantIds.map(participantId => tx.objectStore('participants').delete(participantId)),
    ...expenses.map(expense => tx.objectStore('expenses').delete(expense.id)),
    ...shares.map(share => tx.objectStore('expenseShares').delete([share.expenseId, share.participantId])),
    ...settlements.map(settlement => tx.objectStore('settlements').delete(settlement.id)),
    tx.objectStore('pendingMutations').delete(mutationId),
  ])
  await tx.done
}

export async function acknowledgeAccountGroupDelete(group: Group, mutationId: string): Promise<void> {
  const db = await database()
  const stores = ['groups', 'participants', 'pendingMutations', 'expenses', 'expenseShares', 'settlements', 'accountWorkspace'] as const
  const tx = db.transaction(stores, 'readwrite')
  const workspace = await tx.objectStore('accountWorkspace').get(ACCOUNT_WORKSPACE_KEY)
  if (!workspace) throw new Error('Account workspace is missing')
  const expenses = (await tx.objectStore('expenses').getAll()).filter(expense => expense.groupId === group.id)
  const expenseIds = new Set(expenses.map(expense => expense.id))
  const shares = (await tx.objectStore('expenseShares').getAll()).filter(share => expenseIds.has(share.expenseId))
  const settlements = (await tx.objectStore('settlements').getAll()).filter(settlement => settlement.groupId === group.id)
  const groupRevisions = { ...workspace.groupRevisions }
  delete groupRevisions[group.id]
  await Promise.all([
    tx.objectStore('groups').delete(group.id),
    ...group.participantIds.map(participantId => tx.objectStore('participants').delete(participantId)),
    ...expenses.map(expense => tx.objectStore('expenses').delete(expense.id)),
    ...shares.map(share => tx.objectStore('expenseShares').delete([share.expenseId, share.participantId])),
    ...settlements.map(settlement => tx.objectStore('settlements').delete(settlement.id)),
    tx.objectStore('pendingMutations').delete(mutationId),
    tx.objectStore('accountWorkspace').put({
      ...workspace,
      groupRevisions,
      conflictedGroupIds: workspace.conflictedGroupIds.filter(id => id !== group.id),
      lastSuccessfulSyncAt: new Date().toISOString(),
    }),
  ])
  await tx.done
}

export async function removePendingMutation(mutationId: string): Promise<void> {
  const db = await database(); const tx = db.transaction('pendingMutations', 'readwrite')
  await tx.store.delete(mutationId); await tx.done
}

export async function acknowledgeAccountMutation(mutationId: string, groupId: string, revision: number): Promise<void> {
  const db = await database(); const tx = db.transaction(['pendingMutations', 'accountWorkspace'], 'readwrite')
  const workspace = await tx.objectStore('accountWorkspace').get(ACCOUNT_WORKSPACE_KEY)
  if (!workspace) throw new Error('Account workspace is missing')
  await tx.objectStore('pendingMutations').delete(mutationId)
  await tx.objectStore('accountWorkspace').put({
    ...workspace,
    groupRevisions: { ...workspace.groupRevisions, [groupId]: revision },
    conflictedGroupIds: workspace.conflictedGroupIds.filter(id => id !== groupId),
    lastSuccessfulSyncAt: new Date().toISOString(),
  })
  await tx.done
}

export async function persistAccountConflict(groupId: string): Promise<void> {
  const db = await database(); const tx = db.transaction('accountWorkspace', 'readwrite')
  const workspace = await tx.store.get(ACCOUNT_WORKSPACE_KEY)
  if (!workspace) throw new Error('Account workspace is missing')
  if (!workspace.conflictedGroupIds.includes(groupId)) {
    await tx.store.put({ ...workspace, conflictedGroupIds: [...workspace.conflictedGroupIds, groupId] })
  }
  await tx.done
}

export async function acceptServerGroupVersion(snapshot: {
  revision: number
  group: Omit<Group, 'participantIds'>
  participants: readonly Participant[]
  expenses: readonly Expense[]
  settlements: readonly DurableSettlementSnapshot[]
}): Promise<void> {
  const db = await database()
  const stores = ['accountWorkspace', 'groups', 'participants', 'pendingMutations', 'expenses', 'expenseShares', 'settlements'] as const
  const tx = db.transaction(stores, 'readwrite')
  const groupId = snapshot.group.id
  const workspace = await tx.objectStore('accountWorkspace').get(ACCOUNT_WORKSPACE_KEY)
  if (!workspace) throw new Error('Account workspace is missing')
  const localParticipants = (await tx.objectStore('participants').getAll()).filter(item => item.groupId === groupId)
  const localExpenses = (await tx.objectStore('expenses').getAll()).filter(item => item.groupId === groupId)
  const localExpenseIds = new Set(localExpenses.map(item => item.id))
  const localShares = (await tx.objectStore('expenseShares').getAll()).filter(item => localExpenseIds.has(item.expenseId))
  const localSettlements = (await tx.objectStore('settlements').getAll()).filter(item => item.groupId === groupId)
  const localMutations = (await tx.objectStore('pendingMutations').getAll()).filter(item => item.groupId === groupId)
  await Promise.all([
    ...localParticipants.map(item => tx.objectStore('participants').delete(item.id)),
    ...localExpenses.map(item => tx.objectStore('expenses').delete(item.id)),
    ...localShares.map(item => tx.objectStore('expenseShares').delete([item.expenseId, item.participantId])),
    ...localSettlements.map(item => tx.objectStore('settlements').delete(item.id)),
    ...localMutations.map(item => tx.objectStore('pendingMutations').delete(item.id)),
  ])
  await tx.objectStore('groups').put({ ...snapshot.group, participantIds: [...snapshot.participants].sort((a, b) => a.order - b.order).map(item => item.id) })
  for (const participant of snapshot.participants) await tx.objectStore('participants').put(participant)
  for (const expense of snapshot.expenses) {
    await tx.objectStore('expenses').put(expenseRecord(expense))
    for (const share of expense.shares) await tx.objectStore('expenseShares').put({ expenseId: expense.id, ...share })
  }
  for (const settlement of snapshot.settlements) await tx.objectStore('settlements').put(settlement)
  await tx.objectStore('accountWorkspace').put({
    ...workspace,
    groupRevisions: { ...workspace.groupRevisions, [groupId]: snapshot.revision },
    conflictedGroupIds: workspace.conflictedGroupIds.filter(id => id !== groupId),
    lastSuccessfulSyncAt: new Date().toISOString(),
  })
  await tx.done
}

export async function rebaseLocalGroupVersion(groupId: string, serverRevision: number): Promise<void> {
  const db = await database(); const tx = db.transaction('accountWorkspace', 'readwrite')
  const workspace = await tx.store.get(ACCOUNT_WORKSPACE_KEY)
  if (!workspace) throw new Error('Account workspace is missing')
  await tx.store.put({
    ...workspace,
    groupRevisions: { ...workspace.groupRevisions, [groupId]: serverRevision },
    conflictedGroupIds: workspace.conflictedGroupIds.filter(id => id !== groupId),
  })
  await tx.done
}

export async function persistSettings(settings: DurableSettings): Promise<void> {
  const db = await database(); await db.put('settings', { key: SETTINGS_KEY, ...settings })
}

export async function resetDurableState(): Promise<void> {
  const db = await database()
  const tx = db.transaction(
    ['accessIdentity', 'accountWorkspace', 'accountAdoption', 'groups', 'participants', 'people', 'pendingPersonMutations', 'pendingMutations', 'settings', 'expenses', 'expenseShares', 'settlements'],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore('accessIdentity').clear(),
    tx.objectStore('accountWorkspace').clear(),
    tx.objectStore('accountAdoption').clear(),
    tx.objectStore('groups').clear(),
    tx.objectStore('participants').clear(),
    tx.objectStore('people').clear(),
    tx.objectStore('pendingPersonMutations').clear(),
    tx.objectStore('pendingMutations').clear(),
    tx.objectStore('settings').clear(),
    tx.objectStore('expenses').clear(),
    tx.objectStore('expenseShares').clear(),
    tx.objectStore('settlements').clear(),
  ])
  await tx.done
}
