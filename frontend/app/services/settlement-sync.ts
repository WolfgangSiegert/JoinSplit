import type { PendingCreateSettlement, PendingDeleteSettlement, PendingUpdateSettlement } from '../domain/pending-mutation'
import type { DurableSettlementSnapshot } from '../domain/settlement'
import { acknowledgeAccountMutation, removePendingMutation } from '../persistence/database'
import { accountMutationContext, applyAccountMutationResponse } from './account-mutation'
import { durableSettlement } from '../persistence/validation'
import { useGroupsStore, type MutationSyncError } from '../stores/groups'

type SettlementMutation = PendingCreateSettlement | PendingUpdateSettlement | PendingDeleteSettlement
interface Options {
  readonly mutationId: string
  readonly apiBase: string
  readonly identity: { readonly accessIdentityId: string | null; readonly credential: string | null }
  readonly groupsStore: ReturnType<typeof useGroupsStore>
  readonly online: boolean
  readonly fetcher?: typeof fetch
  readonly acknowledge?: (mutationId: string) => Promise<void>
}
export type SettlementSyncResult = { outcome: 'synced'; status: number } | { outcome: 'offline' | 'busy' | 'not-pending' } | { outcome: 'failed'; error: Readonly<MutationSyncError> }
function failure(kind: MutationSyncError['kind'], message: string, retryable: boolean): SettlementSyncResult { return { outcome: 'failed', error: Object.freeze({ kind, message, retryable }) } }
function sameSettlement(body: unknown, expected: DurableSettlementSnapshot): boolean {
  if (typeof body !== 'object' || body === null || !('data' in body) || !durableSettlement(body.data)) return false
  const actual = body.data
  return Object.keys(expected).every(key => actual[key as keyof DurableSettlementSnapshot] === expected[key as keyof DurableSettlementSnapshot])
}
function requestBody(mutation: SettlementMutation): Record<string, string> | undefined {
  if (mutation.type === 'DeleteSettlement') return undefined
  const settlement = mutation.payload.settlement
  const desired = { senderParticipantId: settlement.senderParticipantId, receiverParticipantId: settlement.receiverParticipantId, amountMinor: settlement.amountMinor, occurredOn: settlement.occurredOn }
  return mutation.type === 'CreateSettlement' ? { settlementId: settlement.id, ...desired } : desired
}

export async function synchronizeSettlementMutation(options: Options): Promise<SettlementSyncResult> {
  if (!options.online) return { outcome: 'offline' }
  const pending = options.groupsStore.pendingMutations.find(item => item.id === options.mutationId)
  if (!pending || !['CreateSettlement', 'UpdateSettlement', 'DeleteSettlement'].includes(pending.type)) return { outcome: 'not-pending' }
  if (options.groupsStore.mutationSync[pending.id]?.state === 'syncing') return { outcome: 'busy' }
  const mutation = options.groupsStore.beginMutationSync(pending.id) as SettlementMutation | null
  if (!mutation) return { outcome: 'busy' }
  if (!options.identity.accessIdentityId) {
    const result = failure('identity', 'Die lokale Zugriffsidentität ist nicht verfügbar.', false)
    if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
    return result
  }
  let response: Response
  try {
    const fetcher = options.fetcher ?? globalThis.fetch
    const context = await accountMutationContext(options.apiBase, options.identity, options.groupsStore, mutation, fetcher)
    const collection = `${context.urlPrefix}/groups/${mutation.groupId}/settlements`
    const url = mutation.type === 'CreateSettlement' ? collection : `${collection}/${mutation.payload.settlement.id}`
    const body = requestBody(mutation)
    response = await fetcher(url, {
      method: mutation.type === 'CreateSettlement' ? 'POST' : mutation.type === 'UpdateSettlement' ? 'PUT' : 'DELETE',
      headers: context.headers,
      credentials: context.credentials,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (context.accountMode) await applyAccountMutationResponse(response, mutation, options.groupsStore)
  } catch {
    const result = failure('network', 'Der Server ist derzeit nicht erreichbar. Die Zahlung bleibt lokal gespeichert.', true)
    if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
    return result
  }
  let result: SettlementSyncResult
  if (mutation.type === 'DeleteSettlement' && response.status === 204) result = { outcome: 'synced', status: 204 }
  else if ((mutation.type === 'CreateSettlement' && (response.status === 200 || response.status === 201)) || (mutation.type === 'UpdateSettlement' && response.status === 200)) {
    try { result = sameSettlement(await response.json(), mutation.payload.settlement) ? { outcome: 'synced', status: response.status } : failure('reconciliation', 'Die Serverbestätigung passt nicht zur lokalen Zahlung.', false) }
    catch { result = failure('reconciliation', 'Die Serverbestätigung passt nicht zur lokalen Zahlung.', false) }
  } else if (response.status === 410) result = failure('expired', 'Die Server-Aufbewahrung ist beendet. Die Daten bleiben nur lokal verfügbar.', false)
  else if (response.status === 429) result = failure('rate-limited', 'Zu viele Anfragen. Die Synchronisierung wird später erneut versucht.', true)
  else if ([401, 403, 404].includes(response.status)) result = failure('unauthorized', 'Die Zahlung konnte für diese Gruppe nicht bestätigt werden.', false)
  else if (response.status === 409) result = failure('conflict', 'Die Zahlung steht im Konflikt mit dem Serverstand. Lokal wurde nichts überschrieben.', false)
  else if (response.status === 422) result = failure('validation', 'Der Server hat die lokale Zahlung abgelehnt.', false)
  else if (response.status >= 500) result = failure('server', 'Der Server konnte die Zahlung nicht bestätigen.', true)
  else result = failure('unexpected', 'Die Synchronisierung erhielt eine unerwartete Antwort.', true)
  if (result.outcome === 'synced') {
    try {
      if (options.acknowledge) await options.acknowledge(mutation.id)
      else if (!options.identity.credential) {
        const revision = options.groupsStore.groupRevisions[mutation.groupId]
        if (typeof revision !== 'number' || !Number.isSafeInteger(revision)) throw new Error('Account revision missing')
        await acknowledgeAccountMutation(mutation.id, mutation.groupId, revision)
      } else await removePendingMutation(mutation.id)
      options.groupsStore.confirmMutationSync(mutation.id)
    }
    catch { result = failure('persistence', 'Die Serverbestätigung konnte lokal nicht gespeichert werden.', true) }
  }
  if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
  return result
}
