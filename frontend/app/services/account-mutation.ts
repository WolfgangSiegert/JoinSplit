import { persistAccountConflict } from '../persistence/database'
import type { PendingMutation } from '../domain/pending-mutation'
import type { useGroupsStore } from '../stores/groups'

interface Identity { readonly accessIdentityId: string | null; readonly credential: string | null }

export interface AccountMutationContext {
  readonly urlPrefix: string
  readonly headers: Record<string, string>
  readonly credentials?: RequestCredentials
  readonly accountMode: boolean
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
