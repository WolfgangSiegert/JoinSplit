import type { Expense } from '../domain/expense'
import type { PendingCreateExpense, PendingDeleteExpense, PendingUpdateExpense } from '../domain/pending-mutation'
import { removePendingMutation } from '../persistence/database'
import { useGroupsStore, type MutationSyncError } from '../stores/groups'

type ExpenseMutation = PendingCreateExpense | PendingUpdateExpense | PendingDeleteExpense
interface Options {
  readonly mutationId: string
  readonly apiBase: string
  readonly identity: { readonly accessIdentityId: string | null; readonly credential: string | null }
  readonly groupsStore: ReturnType<typeof useGroupsStore>
  readonly online: boolean
  readonly fetcher?: typeof fetch
  readonly acknowledge?: (mutationId: string) => Promise<void>
}
export type ExpenseSyncResult = { outcome: 'synced'; status: number } | { outcome: 'offline' | 'busy' | 'not-pending' } | { outcome: 'failed'; error: Readonly<MutationSyncError> }
function failure(kind: MutationSyncError['kind'], message: string, retryable: boolean): ExpenseSyncResult { return { outcome: 'failed', error: Object.freeze({ kind, message, retryable }) } }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function sameExpense(body: unknown, expected: Expense): boolean {
  if (!record(body) || !record(body.data)) return false
  const data = body.data
  if (data.id !== expected.id || data.groupId !== expected.groupId || data.description !== expected.description || data.amountMinor !== expected.amountMinor || data.incurredOn !== expected.incurredOn || data.payerParticipantId !== expected.payerParticipantId || data.creatorAccessIdentityId !== expected.creatorAccessIdentityId || data.splitMethod !== 'equal' || !Array.isArray(data.shares) || data.shares.length !== expected.shares.length) return false
  const shares = data.shares
  return expected.shares.every((share, index) => { const actual = shares[index]; return record(actual) && actual.participantId === share.participantId && actual.amountMinor === share.amountMinor })
}
function requestBody(mutation: ExpenseMutation): Record<string, unknown> | undefined {
  if (mutation.type === 'DeleteExpense') return undefined
  const expense = mutation.payload.expense
  const desired = { description: expense.description, amountMinor: expense.amountMinor, incurredOn: expense.incurredOn, payerParticipantId: expense.payerParticipantId, participantIds: expense.shares.map(share => share.participantId) }
  return mutation.type === 'CreateExpense' ? { expenseId: expense.id, ...desired } : desired
}

export async function synchronizeExpenseMutation(options: Options): Promise<ExpenseSyncResult> {
  if (!options.online) return { outcome: 'offline' }
  const pending = options.groupsStore.pendingMutations.find(item => item.id === options.mutationId)
  if (!pending || !['CreateExpense', 'UpdateExpense', 'DeleteExpense'].includes(pending.type)) return { outcome: 'not-pending' }
  if (options.groupsStore.mutationSync[pending.id]?.state === 'syncing') return { outcome: 'busy' }
  const mutation = options.groupsStore.beginMutationSync(pending.id) as ExpenseMutation | null
  if (!mutation) return { outcome: 'busy' }
  if (!options.identity.accessIdentityId || !options.identity.credential) {
    const result = failure('identity', 'Die lokale Zugriffsidentität ist nicht verfügbar.', false)
    if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
    return result
  }
  const base = options.apiBase.replace(/\/$/u, '')
  const collection = `${base}/api/groups/${mutation.groupId}/expenses`
  const url = mutation.type === 'CreateExpense' ? collection : `${collection}/${mutation.payload.expense.id}`
  const body = requestBody(mutation)
  let response: Response
  try {
    response = await (options.fetcher ?? globalThis.fetch)(url, { method: mutation.type === 'CreateExpense' ? 'POST' : mutation.type === 'UpdateExpense' ? 'PUT' : 'DELETE', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Access-Identity-ID': options.identity.accessIdentityId, Authorization: `Bearer ${options.identity.credential}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
  } catch {
    const result = failure('network', 'Der Server ist derzeit nicht erreichbar. Die Ausgabe bleibt lokal gespeichert.', true)
    if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
    return result
  }
  let result: ExpenseSyncResult
  if (mutation.type === 'DeleteExpense' && response.status === 204) result = { outcome: 'synced', status: 204 }
  else if ((mutation.type === 'CreateExpense' && (response.status === 200 || response.status === 201))
    || (mutation.type === 'UpdateExpense' && response.status === 200)) {
    try { result = sameExpense(await response.json(), mutation.payload.expense) ? { outcome: 'synced', status: response.status } : failure('reconciliation', 'Die Serverbestätigung passt nicht zur lokalen Ausgabe.', false) }
    catch { result = failure('reconciliation', 'Die Serverbestätigung passt nicht zur lokalen Ausgabe.', false) }
  } else if ([401, 403, 404].includes(response.status)) result = failure('unauthorized', 'Die Ausgabe konnte für diese Gruppe nicht bestätigt werden.', false)
  else if (response.status === 409) result = failure('conflict', 'Die Ausgabe steht im Konflikt mit dem Serverstand. Lokal wurde nichts überschrieben.', false)
  else if (response.status === 422) result = failure('validation', 'Der Server hat die lokale Ausgabe abgelehnt.', false)
  else if (response.status >= 500) result = failure('server', 'Der Server konnte die Ausgabe nicht bestätigen.', true)
  else result = failure('unexpected', 'Die Synchronisierung erhielt eine unerwartete Antwort.', true)
  if (result.outcome === 'synced') {
    try { await (options.acknowledge ?? removePendingMutation)(mutation.id); options.groupsStore.confirmMutationSync(mutation.id) }
    catch { result = failure('persistence', 'Die Serverbestätigung konnte lokal nicht gespeichert werden.', true) }
  }
  if (result.outcome === 'failed') options.groupsStore.failMutationSync(mutation.id, result.error)
  return result
}
