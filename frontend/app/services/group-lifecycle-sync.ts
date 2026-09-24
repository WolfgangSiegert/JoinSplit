import type { PendingArchiveGroup, PendingDeleteGroup, PendingReactivateGroup } from '../domain/pending-mutation'
import { acknowledgeGroupDelete, removePendingMutation } from '../persistence/database'
import { useGroupsStore, type MutationSyncError } from '../stores/groups'

type GroupLifecycleMutation = PendingArchiveGroup | PendingReactivateGroup | PendingDeleteGroup
interface Options {
  readonly mutationId: string
  readonly apiBase: string
  readonly identity: { readonly accessIdentityId: string | null; readonly credential: string | null }
  readonly groupsStore: ReturnType<typeof useGroupsStore>
  readonly online: boolean
  readonly fetcher?: typeof fetch
  readonly acknowledgeStatus?: (mutationId: string) => Promise<void>
  readonly acknowledgeDelete?: (groupId: string, mutationId: string) => Promise<void>
}
export type GroupLifecycleSyncResult =
  | { outcome: 'synced'; status: number }
  | { outcome: 'offline' | 'busy' | 'not-pending' }
  | { outcome: 'failed'; error: Readonly<MutationSyncError> }

function failure(kind: MutationSyncError['kind'], message: string, retryable: boolean): GroupLifecycleSyncResult {
  return { outcome: 'failed', error: Object.freeze({ kind, message, retryable }) }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function responseMatches(
  body: unknown,
  mutation: PendingArchiveGroup | PendingReactivateGroup,
  expectedHasFinancialHistory: boolean,
): boolean {
  return record(body) && record(body.data)
    && body.data.id === mutation.groupId && body.data.status === mutation.payload.status
    && body.data.hasFinancialHistory === expectedHasFinancialHistory
}

export async function synchronizeGroupLifecycleMutation(options: Options): Promise<GroupLifecycleSyncResult> {
  if (!options.online) return { outcome: 'offline' }
  const pending = options.groupsStore.pendingMutations.find(mutation => mutation.id === options.mutationId)
  if (!pending || !['ArchiveGroup', 'ReactivateGroup', 'DeleteGroup'].includes(pending.type)) return { outcome: 'not-pending' }
  if (options.groupsStore.mutationSync[pending.id]?.state === 'syncing') return { outcome: 'busy' }
  const started = options.groupsStore.beginMutationSync(pending.id)
  if (!started || (started.type !== 'ArchiveGroup' && started.type !== 'ReactivateGroup' && started.type !== 'DeleteGroup')) return { outcome: 'busy' }
  const mutation: GroupLifecycleMutation = started
  if (!options.identity.accessIdentityId || !options.identity.credential) {
    const result = failure('identity', 'Die lokale Zugriffsidentität ist nicht verfügbar.', false)
    if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
    return result
  }

  const url = `${options.apiBase.replace(/\/$/u, '')}/api/groups/${mutation.groupId}`
  let response: Response
  try {
    response = await (options.fetcher ?? globalThis.fetch)(url, {
      method: mutation.type === 'DeleteGroup' ? 'DELETE' : 'PATCH',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        'X-Access-Identity-ID': options.identity.accessIdentityId,
        Authorization: `Bearer ${options.identity.credential}`,
      },
      ...(mutation.type === 'DeleteGroup' ? {} : { body: JSON.stringify(mutation.payload) }),
    })
  } catch {
    const result = failure('network', 'Der Server ist derzeit nicht erreichbar. Die Gruppenänderung bleibt lokal gespeichert.', true)
    if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
    return result
  }

  let result: GroupLifecycleSyncResult
  if (mutation.type === 'DeleteGroup' && (response.status === 204 || response.status === 404)) {
    result = { outcome: 'synced', status: response.status }
  } else if (mutation.type !== 'DeleteGroup' && response.status === 200) {
    try {
      const group = options.groupsStore.findStoredGroup(mutation.groupId)
      result = group && responseMatches(await response.json(), mutation, group.hasFinancialHistory)
        ? { outcome: 'synced', status: 200 }
        : failure('reconciliation', 'Die Serverbestätigung passt nicht zur lokalen Gruppenänderung.', false)
    } catch {
      result = failure('reconciliation', 'Die Serverbestätigung passt nicht zur lokalen Gruppenänderung.', false)
    }
  } else if ([401, 403, 404].includes(response.status)) result = failure('unauthorized', 'Die Gruppenänderung konnte nicht bestätigt werden.', false)
  else if (response.status === 409) result = failure('conflict', 'Die Gruppenänderung steht im Konflikt mit dem Serverstand.', false)
  else if (response.status === 422) result = failure('validation', 'Der Server hat die Gruppenänderung abgelehnt.', false)
  else if (response.status >= 500) result = failure('server', 'Der Server konnte die Gruppenänderung nicht bestätigen.', true)
  else result = failure('unexpected', 'Die Synchronisierung erhielt eine unerwartete Antwort.', true)

  if (result.outcome === 'synced') {
    try {
      if (mutation.type === 'DeleteGroup') {
        const group = options.groupsStore.findStoredGroup(mutation.groupId)
        if (!group) throw new Error('Group deletion tombstone missing')
        await (options.acknowledgeDelete ?? ((groupId, mutationId) => acknowledgeGroupDelete(group, mutationId)))(mutation.groupId, mutation.id)
        options.groupsStore.commitGroupDeleteAcknowledgement(mutation.groupId, mutation.id)
      } else {
        await (options.acknowledgeStatus ?? removePendingMutation)(mutation.id)
        options.groupsStore.confirmMutationSync(mutation.id)
      }
    } catch {
      result = failure('persistence', 'Die Serverbestätigung konnte lokal nicht gespeichert werden.', true)
    }
  }
  if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
  return result
}
