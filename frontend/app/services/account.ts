import type { Group, Participant } from '../domain/create-group'
import type { Expense } from '../domain/expense'
import type { DurableSettlementSnapshot } from '../domain/settlement'
import {
  replaceWithAccountHydration,
  type AccountHydration,
  type DurableAccountWorkspace,
} from '../persistence/database'
import { validateDurableState } from '../persistence/validation'

interface AccountData { readonly id: string; readonly email: string }
export interface GroupSnapshot {
  readonly revision: number
  readonly group: Omit<Group, 'participantIds'>
  readonly participants: Participant[]
  readonly expenses: Expense[]
  readonly settlements: DurableSettlementSnapshot[]
}

export interface AccountWorkspaceResponse {
  readonly account: AccountData
  readonly groups: GroupSnapshot[]
}

export class AccountRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function base(apiBase: string): string { return apiBase.replace(/\/$/u, '') }

async function json(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return null }
}

async function csrf(apiBase: string, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(`${base(apiBase)}/api/account/csrf`, {
    headers: { Accept: 'application/json' }, credentials: 'include',
  })
  const body = await json(response) as { data?: { csrfToken?: unknown } } | null
  if (!response.ok || typeof body?.data?.csrfToken !== 'string') throw new AccountRequestError(response.status, 'Sicherheitsprüfung fehlgeschlagen.')
  return body.data.csrfToken
}

async function mutate(apiBase: string, path: string, method: string, body: unknown, fetcher: typeof fetch): Promise<Response> {
  const token = await csrf(apiBase, fetcher)
  const response = await fetcher(`${base(apiBase)}${path}`, {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = await json(response) as { message?: unknown } | null
    throw new AccountRequestError(response.status, typeof payload?.message === 'string' ? payload.message : 'Account-Anfrage fehlgeschlagen.')
  }
  return response
}

export async function registerAccount(apiBase: string, email: string, password: string, fetcher: typeof fetch = globalThis.fetch): Promise<AccountData> {
  const response = await mutate(apiBase, '/api/account/register', 'POST', {
    email, password, password_confirmation: password, dataAdoptionConfirmed: true,
  }, fetcher)
  return ((await json(response)) as { data: AccountData }).data
}

export async function loginAccount(apiBase: string, email: string, password: string, fetcher: typeof fetch = globalThis.fetch): Promise<AccountData> {
  const response = await mutate(apiBase, '/api/account/login', 'POST', { email, password }, fetcher)
  return ((await json(response)) as { data: AccountData }).data
}

export async function linkAnonymousIdentity(apiBase: string, identityId: string, credential: string, fetcher: typeof fetch = globalThis.fetch): Promise<void> {
  const token = await csrf(apiBase, fetcher)
  const response = await fetcher(`${base(apiBase)}/api/account/access-identities/link`, {
    method: 'POST', credentials: 'include',
    headers: { Accept: 'application/json', 'X-CSRF-TOKEN': token, 'X-Access-Identity-ID': identityId, Authorization: `Bearer ${credential}` },
  })
  if (!response.ok) throw new AccountRequestError(response.status, 'Die Browser-Identität konnte nicht übernommen werden.')
}

export async function createAccountIdentity(apiBase: string, identityId: string, fetcher: typeof fetch = globalThis.fetch): Promise<void> {
  await mutate(apiBase, '/api/account/access-identities', 'POST', { identityId }, fetcher)
}

export async function importAccountGroup(apiBase: string, adoptionId: string, importId: string, snapshot: Omit<GroupSnapshot, 'revision'>, fetcher: typeof fetch = globalThis.fetch): Promise<void> {
  await mutate(apiBase, `/api/account/adoptions/${adoptionId}/groups/${snapshot.group.id}/import`, 'POST', { importId, snapshot }, fetcher)
}

export async function fetchAccountWorkspace(apiBase: string, fetcher: typeof fetch = globalThis.fetch): Promise<AccountWorkspaceResponse> {
  const response = await fetcher(`${base(apiBase)}/api/account/workspace`, {
    headers: { Accept: 'application/json' }, credentials: 'include',
  })
  const body = await json(response) as { data?: AccountWorkspaceResponse } | null
  if (!response.ok || !body?.data) throw new AccountRequestError(response.status, 'Accountdaten konnten nicht geladen werden.')
  return body.data
}

export async function persistHydratedWorkspace(response: AccountWorkspaceResponse, currentIdentityId: string): Promise<AccountHydration> {
  const groups: Group[] = response.groups.map(item => ({
    ...item.group,
    participantIds: [...item.participants].sort((a, b) => a.order - b.order).map(participant => participant.id),
  }))
  const identityIds = [...new Set([currentIdentityId, ...groups.map(group => group.ownerAccessIdentityId)])]
  const workspace: DurableAccountWorkspace = {
    accountId: response.account.id,
    email: response.account.email,
    accessIdentityIds: identityIds,
    groupRevisions: Object.fromEntries(response.groups.map(item => [item.group.id, item.revision])),
    conflictedGroupIds: [],
  }
  const hydration: AccountHydration = {
    identity: { id: currentIdentityId, credential: null, synchronizationStatus: 'account-linked' },
    workspace,
    groups,
    participants: response.groups.flatMap(item => item.participants),
    expenses: response.groups.flatMap(item => item.expenses),
    settlements: response.groups.flatMap(item => item.settlements),
  }
  validateDurableState({
    accessIdentity: hydration.identity, accountWorkspace: workspace,
    groups: [...hydration.groups], participants: [...hydration.participants], pendingMutations: [],
    expenses: [...hydration.expenses], settlements: [...hydration.settlements], settings: null,
  })
  await replaceWithAccountHydration(hydration)
  return hydration
}

export async function logoutAccount(apiBase: string, fetcher: typeof fetch = globalThis.fetch): Promise<void> {
  await mutate(apiBase, '/api/account/logout', 'POST', undefined, fetcher)
}

export async function deleteAccount(apiBase: string, password: string, fetcher: typeof fetch = globalThis.fetch): Promise<void> {
  await mutate(apiBase, '/api/account', 'DELETE', { password }, fetcher)
}
