import type { PendingAddParticipant, PendingDeactivateParticipant, PendingDeleteParticipant, PendingMutation, PendingRenameParticipant } from '../domain/pending-mutation'
import { removePendingMutation } from '../persistence/database'
import { useGroupsStore, type MutationSyncError } from '../stores/groups'

interface Options {
  readonly mutationId: string
  readonly apiBase: string
  readonly identity: { readonly accessIdentityId: string | null; readonly credential: string | null }
  readonly groupsStore: ReturnType<typeof useGroupsStore>
  readonly online: boolean
  readonly fetcher?: typeof fetch
  readonly acknowledge?: (mutationId: string) => Promise<void>
}

export type ParticipantSyncResult =
  | { outcome: 'synced'; status: number }
  | { outcome: 'offline' | 'busy' | 'not-pending' }
  | { outcome: 'failed'; error: Readonly<MutationSyncError> }

function failed(kind: MutationSyncError['kind'], message: string, retryable: boolean): ParticipantSyncResult {
  return { outcome: 'failed', error: Object.freeze({ kind, message, retryable }) }
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function sameUuid(value: unknown, expected: string): boolean { return typeof value === 'string' && value.toLowerCase() === expected.toLowerCase() }

type ParticipantMutation = PendingAddParticipant | PendingRenameParticipant | PendingDeactivateParticipant | PendingDeleteParticipant
type ParticipantResponseMutation = Exclude<ParticipantMutation, PendingDeleteParticipant>

function responseMatches(body: unknown, mutation: ParticipantResponseMutation): boolean {
  if (!object(body) || !object(body.data)) return false
  const participant = body.data
  if (!sameUuid(participant.id, mutation.payload.participantId) || !sameUuid(participant.groupId, mutation.groupId)) return false
  if (mutation.type === 'AddParticipant') return participant.name === mutation.payload.name && participant.active === true && participant.order === mutation.payload.order
  return participant.name === mutation.payload.name
    && participant.active === mutation.payload.active
    && participant.order === mutation.payload.order
}

async function send(mutation: ParticipantMutation, options: Options): Promise<ParticipantSyncResult> {
  const base = options.apiBase.replace(/\/$/u, '')
  const participantId = mutation.payload.participantId
  const collection = `${base}/api/groups/${mutation.groupId}/participants`
  const url = mutation.type === 'AddParticipant' ? collection : `${collection}/${participantId}`
  const method = mutation.type === 'AddParticipant' ? 'POST' : mutation.type === 'DeleteParticipant' ? 'DELETE' : 'PATCH'
  const body = mutation.type === 'AddParticipant' ? mutation.payload
    : mutation.type === 'RenameParticipant' ? { name: mutation.payload.name } : mutation.type === 'DeactivateParticipant' ? { active: false } : undefined
  let response: Response
  try {
    response = await (options.fetcher ?? globalThis.fetch)(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json',
        'X-Access-Identity-ID': options.identity.accessIdentityId!, Authorization: `Bearer ${options.identity.credential}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch { return failed('network', 'Der Server ist derzeit nicht erreichbar. Die Änderung bleibt lokal gespeichert.', true) }
  if (mutation.type === 'DeleteParticipant' && response.status === 204) return { outcome: 'synced', status: 204 }
  if ((response.status === 200 || response.status === 201) && mutation.type !== 'DeleteParticipant') {
    try {
      if (responseMatches(await response.json(), mutation)) return { outcome: 'synced', status: response.status }
    } catch { /* mapped below */ }
    return failed('reconciliation', 'Die Serverbestätigung passt nicht zur lokalen Änderung.', false)
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) return failed('unauthorized', 'Die Änderung konnte für diese Gruppe nicht bestätigt werden.', false)
  if (response.status === 409) return failed('conflict', 'Die Änderung steht im Konflikt mit dem Serverstand. Lokal wurde nichts überschrieben.', false)
  if (response.status === 422) return failed('validation', 'Der Server hat die lokale Änderung abgelehnt.', false)
  if (response.status >= 500) return failed('server', 'Der Server konnte die Änderung nicht bestätigen.', true)
  return failed('unexpected', 'Die Synchronisierung erhielt eine unerwartete Antwort.', true)
}

export async function synchronizeParticipantMutation(options: Options): Promise<ParticipantSyncResult> {
  if (!options.online) return { outcome: 'offline' }
  const pending = options.groupsStore.pendingMutations.find(item => item.id === options.mutationId)
  if (!pending || !['AddParticipant', 'RenameParticipant', 'DeactivateParticipant', 'DeleteParticipant'].includes(pending.type)) return { outcome: 'not-pending' }
  if (options.groupsStore.mutationSync[pending.id]?.state === 'syncing') return { outcome: 'busy' }
  const mutation = options.groupsStore.beginMutationSync(pending.id)
  if (!mutation || mutation.type === 'CreateGroup'
    || mutation.type === 'CreateExpense' || mutation.type === 'UpdateExpense' || mutation.type === 'DeleteExpense'
    || mutation.type === 'CreateSettlement' || mutation.type === 'UpdateSettlement' || mutation.type === 'DeleteSettlement') return { outcome: 'busy' }
  if (!options.identity.accessIdentityId || !options.identity.credential) {
    const result = failed('identity', 'Die lokale Zugriffsidentität ist nicht verfügbar.', false)
    if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
    return result
  }
  const result = await send(mutation, options)
  if (result.outcome === 'synced') {
    try {
      await (options.acknowledge ?? removePendingMutation)(mutation.id)
      options.groupsStore.confirmMutationSync(mutation.id)
    } catch {
      const persistence = failed('persistence', 'Die Serverbestätigung konnte lokal nicht gespeichert werden.', true)
      if (persistence.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, persistence.error)
      return persistence
    }
  } else if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
  return result
}
