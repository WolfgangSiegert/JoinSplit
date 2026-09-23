import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Group, Participant, PreparedGroupCreation } from '../domain/create-group'
import type { PendingCreateGroup, PendingMutation, PendingAddParticipant, PendingRenameParticipant, PendingDeactivateParticipant, PendingDeleteParticipant } from '../domain/pending-mutation'

export const DATABASE_NAME = 'joinsplit'
export const DATABASE_VERSION = 2
const ACCESS_IDENTITY_KEY = 'current'
const SETTINGS_KEY = 'preferences'

export interface DurableAccessIdentity { readonly id: string; readonly credential: string }
export interface DurableSettings { readonly addSelfAsParticipantByDefault: boolean }
interface AccessIdentityRecord extends DurableAccessIdentity { readonly key: typeof ACCESS_IDENTITY_KEY }
interface SettingsRecord extends DurableSettings { readonly key: typeof SETTINGS_KEY }
interface JoinSplitDatabase extends DBSchema {
  accessIdentity: { key: string; value: AccessIdentityRecord }
  groups: { key: string; value: Group }
  participants: { key: string; value: Participant }
  pendingMutations: { key: string; value: PendingMutation }
  settings: { key: string; value: SettingsRecord }
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
    },
  })
  return databasePromise
}

export async function loadDurableState(): Promise<DurableState> {
  const db = await database()
  const tx = db.transaction(['accessIdentity', 'groups', 'participants', 'pendingMutations', 'settings'], 'readonly')
  const [identities, groups, participants, pendingMutations, settingsRecords] = await Promise.all([
    tx.objectStore('accessIdentity').getAll(), tx.objectStore('groups').getAll(),
    tx.objectStore('participants').getAll(), tx.objectStore('pendingMutations').getAll(),
    tx.objectStore('settings').getAll(), tx.done,
  ])
  if (identities.length > 1 || settingsRecords.length > 1) throw new Error('Invalid persistence singleton records')
  const identity = identities[0]
  const settings = settingsRecords[0]
  return {
    accessIdentity: identity ? { id: identity.id, credential: identity.credential } : null,
    groups, participants, pendingMutations,
    settings: settings ? { addSelfAsParticipantByDefault: settings.addSelfAsParticipantByDefault } : null,
  }
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

export async function removePendingMutation(mutationId: string): Promise<void> {
  const db = await database(); const tx = db.transaction('pendingMutations', 'readwrite')
  await tx.store.delete(mutationId); await tx.done
}

export async function persistSettings(settings: DurableSettings): Promise<void> {
  const db = await database(); await db.put('settings', { key: SETTINGS_KEY, ...settings })
}
