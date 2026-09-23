import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Group, Participant, PreparedGroupCreation } from '../domain/create-group'
import type { PendingCreateGroupMutation } from '../stores/groups'

export const DATABASE_NAME = 'joinsplit'
export const DATABASE_VERSION = 1

const ACCESS_IDENTITY_KEY = 'current'
const SETTINGS_KEY = 'preferences'

export interface DurableAccessIdentity {
  readonly id: string
  readonly credential: string
}

export interface DurableSettings {
  readonly addSelfAsParticipantByDefault: boolean
}

interface AccessIdentityRecord extends DurableAccessIdentity {
  readonly key: typeof ACCESS_IDENTITY_KEY
}

interface SettingsRecord extends DurableSettings {
  readonly key: typeof SETTINGS_KEY
}

interface PendingMutationRecord extends PendingCreateGroupMutation {
  readonly groupId: string
}

interface JoinSplitDatabase extends DBSchema {
  accessIdentity: { key: string; value: AccessIdentityRecord }
  groups: { key: string; value: Group }
  participants: { key: string; value: Participant }
  pendingMutations: { key: string; value: PendingMutationRecord }
  settings: { key: string; value: SettingsRecord }
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function toRuntimeMutation(record: PendingMutationRecord): PendingCreateGroupMutation {
  const initialParticipant = record.payload.initialParticipant
    ? Object.freeze({ ...record.payload.initialParticipant })
    : null
  const payload = Object.freeze({ ...record.payload, initialParticipant })
  return Object.freeze({ kind: 'CreateGroup', payload, status: 'pending' })
}

export interface DurableState {
  readonly accessIdentity: DurableAccessIdentity | null
  readonly groups: Group[]
  readonly participants: Participant[]
  readonly pendingMutations: PendingCreateGroupMutation[]
  readonly settings: DurableSettings | null
}

let databasePromise: Promise<IDBPDatabase<JoinSplitDatabase>> | undefined

function database(): Promise<IDBPDatabase<JoinSplitDatabase>> {
  databasePromise ??= openDB<JoinSplitDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('accessIdentity', { keyPath: 'key' })
        db.createObjectStore('groups', { keyPath: 'id' })
        db.createObjectStore('participants', { keyPath: 'id' })
        db.createObjectStore('pendingMutations', { keyPath: 'groupId' })
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    },
  })

  return databasePromise
}

export async function loadDurableState(): Promise<DurableState> {
  const db = await database()
  const transaction = db.transaction(
    ['accessIdentity', 'groups', 'participants', 'pendingMutations', 'settings'],
    'readonly',
  )
  const [identityRecords, groups, participants, pendingRecords, settingsRecords] =
    await Promise.all([
      transaction.objectStore('accessIdentity').getAll(),
      transaction.objectStore('groups').getAll(),
      transaction.objectStore('participants').getAll(),
      transaction.objectStore('pendingMutations').getAll(),
      transaction.objectStore('settings').getAll(),
      transaction.done,
    ])

  if (identityRecords.length > 1 || settingsRecords.length > 1
    || (identityRecords[0] && identityRecords[0].key !== ACCESS_IDENTITY_KEY)
    || (settingsRecords[0] && settingsRecords[0].key !== SETTINGS_KEY)
    || (identityRecords[0]
      && !hasExactKeys(identityRecords[0], ['key', 'id', 'credential']))
    || (settingsRecords[0]
      && !hasExactKeys(settingsRecords[0], ['key', 'addSelfAsParticipantByDefault']))
    || pendingRecords.some(record =>
      !hasExactKeys(record, ['groupId', 'kind', 'payload', 'status'])
      || record.groupId !== record.payload?.groupId)) {
    throw new Error('Invalid persistence record structure')
  }

  const identityRecord = identityRecords[0]
  const settingsRecord = settingsRecords[0]

  return {
    accessIdentity: identityRecord
      ? { id: identityRecord.id, credential: identityRecord.credential }
      : null,
    groups,
    participants,
    pendingMutations: pendingRecords.map(toRuntimeMutation),
    settings: settingsRecord
      ? { addSelfAsParticipantByDefault: settingsRecord.addSelfAsParticipantByDefault }
      : null,
  }
}

export async function persistAccessIdentity(identity: DurableAccessIdentity): Promise<void> {
  const db = await database()
  await db.put('accessIdentity', { key: ACCESS_IDENTITY_KEY, ...identity })
}

export async function persistGroupCreation(creation: PreparedGroupCreation): Promise<void> {
  const db = await database()
  const transaction = db.transaction(
    ['groups', 'participants', 'pendingMutations'],
    'readwrite',
  )

  await Promise.all([
    transaction.objectStore('groups').add(creation.group),
    creation.participant
      ? transaction.objectStore('participants').add(creation.participant)
      : Promise.resolve(),
    transaction.objectStore('pendingMutations').add({
      groupId: creation.group.id,
      kind: 'CreateGroup',
      payload: creation.payload,
      status: 'pending',
    }),
  ])
  await transaction.done
}

export async function removePendingCreateGroup(groupId: string): Promise<void> {
  const db = await database()
  const transaction = db.transaction('pendingMutations', 'readwrite')
  await transaction.store.delete(groupId)
  await transaction.done
}

export async function persistSettings(settings: DurableSettings): Promise<void> {
  const db = await database()
  await db.put('settings', { key: SETTINGS_KEY, ...settings })
}
