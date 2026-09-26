import type { CreateGroupPayload } from '../domain/create-group'
import {
  useGroupsStore,
  type CreateGroupSyncError,
  type PendingCreateGroupMutation,
} from '../stores/groups'
import { acknowledgeAccountMutation, removePendingMutation } from '../persistence/database'
import { accountMutationContext, applyAccountMutationResponse, type AccountMutationContext } from './account-mutation'

interface AccessIdentityForSync {
  readonly accessIdentityId: string | null
  readonly credential: string | null
}

interface CreateGroupSyncOptions {
  readonly groupId: string
  readonly apiBase: string
  readonly identity: AccessIdentityForSync
  readonly groupsStore: ReturnType<typeof useGroupsStore>
  readonly online: boolean
  readonly fetcher?: typeof fetch
  readonly acknowledge?: (mutationId: string) => Promise<void>
}

type CreateGroupSyncResult =
  | { readonly outcome: 'synced'; readonly status: 200 | 201 }
  | { readonly outcome: 'offline' | 'busy' | 'not-pending' }
  | { readonly outcome: 'failed'; readonly error: Readonly<CreateGroupSyncError> }

function failure(
  kind: CreateGroupSyncError['kind'],
  message: string,
  retryable: boolean,
): CreateGroupSyncResult {
  return { outcome: 'failed', error: Object.freeze({ kind, message, retryable }) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameUuid(left: unknown, right: string): boolean {
  return typeof left === 'string' && left.toLowerCase() === right.toLowerCase()
}

function responseMatchesPayload(responseBody: unknown, payload: Readonly<CreateGroupPayload>): boolean {
  if (!isRecord(responseBody) || !isRecord(responseBody.data)) return false

  const group = responseBody.data.group
  const participant = responseBody.data.initialParticipant
  if (!isRecord(group)) return false

  const groupMatches = sameUuid(group.id, payload.groupId)
    && group.name === payload.name
    && group.currency === payload.currency
    && group.status === 'active'
    && sameUuid(group.ownerAccessIdentityId, payload.actorId)

  if (!groupMatches) return false

  if (payload.initialParticipant === null) return participant === null
  if (!isRecord(participant)) return false

  return sameUuid(participant.id, payload.initialParticipant.participantId)
    && sameUuid(participant.groupId, payload.groupId)
    && participant.name === payload.initialParticipant.name
    && participant.status === 'active'
    && participant.order === 0
}

async function sendPendingCreateGroup(
  mutation: Readonly<PendingCreateGroupMutation>,
  context: AccountMutationContext,
  fetcher: typeof fetch,
  groupsStore: ReturnType<typeof useGroupsStore>,
): Promise<CreateGroupSyncResult> {
  let response: Response

  try {
    response = await fetcher(`${context.urlPrefix}/groups`, {
      method: 'POST',
      headers: context.headers,
      credentials: context.credentials,
      body: JSON.stringify(mutation.payload),
    })
    if (context.accountMode) await applyAccountMutationResponse(response, mutation, groupsStore)
  } catch {
    return failure(
      'network',
      'Der Server ist derzeit nicht erreichbar. Die Gruppe bleibt lokal nutzbar.',
      true,
    )
  }

  if (response.status === 200 || response.status === 201) {
    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      return failure(
        'reconciliation',
        'Die Serverbestätigung war unvollständig. Die Gruppe bleibt zur Prüfung ausstehend.',
        false,
      )
    }

    if (!responseMatchesPayload(responseBody, mutation.payload)) {
      return failure(
        'reconciliation',
        'Die Serverbestätigung passt nicht zur lokalen Gruppe. Die Synchronisierung wurde nicht übernommen.',
        false,
      )
    }

    return { outcome: 'synced', status: response.status }
  }

  if (response.status === 401) {
    return failure(
      'unauthorized',
      'Die Zugriffsidentität konnte nicht bestätigt werden. Die Gruppe bleibt lokal verfügbar.',
      false,
    )
  }
  if (response.status === 410) {
    return failure(
      'expired',
      'Die Server-Aufbewahrung ist beendet. Die Gruppe bleibt nur lokal verfügbar.',
      false,
    )
  }
  if (response.status === 429) {
    return failure('rate-limited', 'Zu viele Anfragen. Die Synchronisierung wird später erneut versucht.', true)
  }
  if (response.status === 409) {
    return failure(
      'conflict',
      'Die Gruppe steht im Konflikt mit vorhandenen Serverdaten. Lokal wurde nichts überschrieben.',
      false,
    )
  }
  if (response.status === 422) {
    return failure(
      'validation',
      'Der Server hat die lokale Erstellung abgelehnt. Die Gruppe bleibt lokal zur Prüfung erhalten.',
      false,
    )
  }
  if (response.status >= 500) {
    return failure(
      'server',
      'Der Server konnte die Gruppe nicht bestätigen. Die Gruppe bleibt lokal nutzbar.',
      true,
    )
  }

  return failure(
    'unexpected',
    'Die Synchronisierung erhielt eine unerwartete Antwort. Die Gruppe bleibt lokal nutzbar.',
    true,
  )
}

export async function synchronizeCreateGroup(
  options: CreateGroupSyncOptions,
): Promise<CreateGroupSyncResult> {
  if (!options.online) return { outcome: 'offline' }

  const pendingBeforeStart = options.groupsStore.findPendingCreate(options.groupId)
  if (!pendingBeforeStart) return { outcome: 'not-pending' }
  if (options.groupsStore.mutationSync[pendingBeforeStart.id]?.state === 'syncing') {
    return { outcome: 'busy' }
  }

  const mutation = options.groupsStore.beginMutationSync(pendingBeforeStart.id)
  if (!mutation || mutation.type !== 'CreateGroup') return { outcome: 'busy' }

  const { accessIdentityId, credential } = options.identity
  if (!accessIdentityId || mutation.payload.actorId !== accessIdentityId) {
    const result = failure(
      'identity',
      'Die lokale Zugriffsidentität ist nicht verfügbar. Die Gruppe bleibt lokal erhalten.',
      false,
    )
    if (result.outcome === 'failed') {
      options.groupsStore.failMutationSync(mutation.id, result.error)
    }
    return result
  }

  const fetcher = options.fetcher ?? globalThis.fetch
  let result: CreateGroupSyncResult
  try {
    const context = await accountMutationContext(options.apiBase, options.identity, options.groupsStore, mutation, fetcher)
    result = await sendPendingCreateGroup(mutation, context, fetcher, options.groupsStore)
  } catch {
    result = failure('network', 'Der Server ist derzeit nicht erreichbar. Die Gruppe bleibt lokal nutzbar.', true)
  }

  if (result.outcome === 'synced') {
    try {
      if (options.acknowledge) await options.acknowledge(mutation.id)
      else if (!credential) {
        const revision = options.groupsStore.groupRevisions[mutation.groupId]
        if (typeof revision !== 'number' || !Number.isSafeInteger(revision)) throw new Error('Account revision missing')
        await acknowledgeAccountMutation(mutation.id, mutation.groupId, revision)
      } else await removePendingMutation(mutation.id)
      options.groupsStore.confirmMutationSync(mutation.id)
    } catch {
      const persistenceFailure = failure(
        'persistence',
        'Die Serverbestätigung konnte lokal nicht gespeichert werden. Die Synchronisierung wird erneut geprüft.',
        true,
      )
      if (persistenceFailure.outcome === 'failed') {
        options.groupsStore.failMutationSync(mutation.id, persistenceFailure.error)
      }
      return persistenceFailure
    }
  } else if (result.outcome === 'failed') {
    options.groupsStore.failMutationSync(mutation.id, result.error)
  }

  return result
}

export { responseMatchesPayload }
