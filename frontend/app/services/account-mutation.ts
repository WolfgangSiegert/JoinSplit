import { persistAccountConflict } from '../persistence/database'
import type { PendingMutation } from '../domain/pending-mutation'
import type { MutationSyncError, useGroupsStore } from '../stores/groups'

interface Identity { readonly accessIdentityId: string | null; readonly credential: string | null }

export interface AccountMutationContext {
  readonly urlPrefix: string
  readonly headers: Record<string, string>
  readonly credentials?: RequestCredentials
  readonly accountMode: boolean
}

export function accountMutationAuthorizationError(
  response: Response,
  accountMode: boolean,
  subject: string,
): Readonly<MutationSyncError> | null {
  if (response.status === 401 && accountMode) {
    return Object.freeze({
      kind: 'session-expired',
      message: 'Deine Anmeldung ist abgelaufen. Melde dich erneut an; die lokalen Änderungen bleiben erhalten.',
      retryable: false,
    })
  }
  if (response.status === 401) {
    return Object.freeze({ kind: 'unauthorized', message: `${subject} konnte mit dieser Gerätefreigabe nicht bestätigt werden.`, retryable: false })
  }
  if (response.status === 403) {
    return Object.freeze({ kind: 'forbidden', message: `Für ${subject.toLowerCase()} fehlt die Berechtigung.`, retryable: false })
  }
  if (response.status === 404) {
    return Object.freeze({ kind: 'not-found', message: `Die zugehörige Gruppe wurde auf dem Server nicht gefunden.`, retryable: false })
  }
  return null
}

export async function accountMutationContext(
  apiBase: string,
  identity: Identity,
  groupsStore: ReturnType<typeof useGroupsStore>,
  mutation: PendingMutation,
  fetcher: typeof fetch,
): Promise<AccountMutationContext> {
  const root = apiBase.replace(/\/$/u, '')
  const headers: Record<string, string> = {
    Accept: 'application/json', 'Content-Type': 'application/json',
    'X-Access-Identity-ID': identity.accessIdentityId ?? '',
  }
  if (identity.credential) {
    headers.Authorization = `Bearer ${identity.credential}`
    return { urlPrefix: `${root}/api`, headers, accountMode: false }
  }

  const csrfResponse = await fetcher(`${root}/api/account/csrf`, { headers: { Accept: 'application/json' }, credentials: 'include' })
  const csrfBody = await csrfResponse.json() as { data?: { csrfToken?: unknown } }
  if (!csrfResponse.ok || typeof csrfBody.data?.csrfToken !== 'string') throw new Error('Account CSRF bootstrap failed')
  headers['X-CSRF-TOKEN'] = csrfBody.data.csrfToken
  headers['X-Mutation-ID'] = mutation.id
  headers['X-Group-Revision'] = String(groupsStore.groupRevisions[mutation.groupId] ?? 0)
  return { urlPrefix: `${root}/api/account/workspace`, headers, credentials: 'include', accountMode: true }
}

export async function applyAccountMutationResponse(
  response: Response,
  mutation: PendingMutation,
  groupsStore: ReturnType<typeof useGroupsStore>,
): Promise<number | null> {
  const revisionHeader = response.headers.get('X-Group-Revision')
  const revision = revisionHeader === null ? Number.NaN : Number(revisionHeader)
  if (response.ok && Number.isSafeInteger(revision) && revision >= 0) {
    if (mutation.type !== 'DeleteGroup') groupsStore.recordRevision(mutation.groupId, revision)
    return revision
  }
  if (response.status === 409 && !groupsStore.conflictedGroups[mutation.groupId]) {
    groupsStore.markRevisionConflict(mutation.groupId)
    await persistAccountConflict(mutation.groupId)
  }
  return null
}
