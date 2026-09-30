import type { Group, Participant } from '../domain/create-group'
import type { Expense } from '../domain/expense'
import type { DurableSettlementSnapshot } from '../domain/settlement'
import type { Person } from '../domain/person'
import {
  appendAccountHydration,
  loadDurableState,
  replaceWithAccountHydration,
  type AccountHydration,
  type DurableAccountWorkspace,
} from '../persistence/database'
import { validateDurableState } from '../persistence/validation'
import { applicationFetch, clearNativeApiCookies } from './http-transport'
import { isGroupArea, isGroupAreaOrder, type GroupArea } from '../domain/group-area'
import { isLanguagePreference, type LanguagePreference } from '../domain/locale'

export interface AccountData {
  readonly id: string
  readonly name: string | null
  readonly email: string
  readonly groupAreaOrder: readonly GroupArea[]
  readonly defaultGroupArea: GroupArea
  readonly languagePreference: LanguagePreference
}
export interface GroupSnapshot {
  readonly revision: number
  readonly group: Omit<Group, 'participantIds'>
  readonly participants: Participant[]
  readonly expenses: Expense[]
  readonly settlements: DurableSettlementSnapshot[]
}

export interface AccountWorkspaceResponse {
  readonly account: AccountData
  readonly people: Person[]
  readonly groups: GroupSnapshot[]
}

export interface PersonAssociation {
  readonly participantId: string
  readonly personId: string
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

export async function registerAccount(apiBase: string, name: string, email: string, password: string, groupAreaOrder: readonly GroupArea[], defaultGroupArea: GroupArea, languagePreference: LanguagePreference, fetcher: typeof fetch = applicationFetch): Promise<AccountData> {
  const response = await mutate(apiBase, '/api/account/register', 'POST', {
    name, email, password, password_confirmation: password, dataAdoptionConfirmed: true, groupAreaOrder, defaultGroupArea, languagePreference,
  }, fetcher)
  return ((await json(response)) as { data: AccountData }).data
}

export async function loginAccount(apiBase: string, email: string, password: string, fetcher: typeof fetch = applicationFetch): Promise<AccountData> {
  const response = await mutate(apiBase, '/api/account/login', 'POST', { email, password }, fetcher)
  return ((await json(response)) as { data: AccountData }).data
}

export async function requestPasswordReset(apiBase: string, email: string, fetcher: typeof fetch = applicationFetch): Promise<void> {
  await mutate(apiBase, '/api/account/password/forgot', 'POST', { email }, fetcher)
}

export async function resetAccountPassword(
  apiBase: string,
  email: string,
  token: string,
  password: string,
  fetcher: typeof fetch = applicationFetch,
): Promise<void> {
  await mutate(apiBase, '/api/account/password/reset', 'POST', {
    email, token, password, password_confirmation: password,
  }, fetcher)
}

export async function linkAnonymousIdentity(apiBase: string, identityId: string, credential: string, fetcher: typeof fetch = applicationFetch): Promise<void> {
  const token = await csrf(apiBase, fetcher)
  const response = await fetcher(`${base(apiBase)}/api/account/access-identities/link`, {
    method: 'POST', credentials: 'include',
    headers: { Accept: 'application/json', 'X-CSRF-TOKEN': token, 'X-Access-Identity-ID': identityId, Authorization: `Bearer ${credential}` },
  })
  if (!response.ok) throw new AccountRequestError(response.status, 'Die Browser-Identität konnte nicht übernommen werden.')
}

export async function createAccountIdentity(apiBase: string, identityId: string, fetcher: typeof fetch = applicationFetch): Promise<void> {
  await mutate(apiBase, '/api/account/access-identities', 'POST', { identityId }, fetcher)
}

export async function importAccountGroup(apiBase: string, adoptionId: string, importId: string, snapshot: Omit<GroupSnapshot, 'revision'>, fetcher: typeof fetch = applicationFetch): Promise<void> {
  await mutate(apiBase, `/api/account/adoptions/${adoptionId}/groups/${snapshot.group.id}/import`, 'POST', { importId, snapshot }, fetcher)
}

export async function importAccountPeople(
  apiBase: string,
  adoptionId: string,
  importId: string,
  people: readonly Pick<Person, 'id' | 'name' | 'status'>[],
  associations: readonly PersonAssociation[],
  fetcher: typeof fetch = applicationFetch,
): Promise<void> {
  await mutate(apiBase, `/api/account/adoptions/${adoptionId}/people/import`, 'POST', {
    importId, people, associations,
  }, fetcher)
}

export async function fetchAccountWorkspace(apiBase: string, fetcher: typeof fetch = applicationFetch): Promise<AccountWorkspaceResponse> {
  const response = await fetcher(`${base(apiBase)}/api/account/workspace`, {
    headers: { Accept: 'application/json' }, credentials: 'include',
  })
  const body = await json(response) as { data?: AccountWorkspaceResponse } | null
  if (!response.ok || !body?.data) throw new AccountRequestError(response.status, 'Accountdaten konnten nicht geladen werden.')
  return body.data
}

export async function fetchCurrentAccount(apiBase: string, fetcher: typeof fetch = applicationFetch): Promise<AccountData> {
  const response = await fetcher(`${base(apiBase)}/api/account`, {
    headers: { Accept: 'application/json' }, credentials: 'include',
  })
  const body = await json(response) as { data?: AccountData } | null
  if (!response.ok || !body?.data || !isGroupAreaOrder(body.data.groupAreaOrder) || !isGroupArea(body.data.defaultGroupArea) || !isLanguagePreference(body.data.languagePreference)) throw new AccountRequestError(response.status, 'Die Account-Sitzung konnte nicht bestätigt werden.')
  return body.data
}

export async function updateAccountGroupAreaOrder(
  apiBase: string,
  groupAreaOrder: readonly GroupArea[],
  fetcher: typeof fetch = applicationFetch,
): Promise<readonly GroupArea[]> {
  if (!isGroupAreaOrder(groupAreaOrder)) throw new Error('Invalid group area order')
  const response = await mutate(apiBase, '/api/account/preferences', 'PUT', { groupAreaOrder }, fetcher)
  const body = await json(response) as { data?: { groupAreaOrder?: unknown } } | null
  if (!isGroupAreaOrder(body?.data?.groupAreaOrder)) throw new AccountRequestError(response.status, 'Die Account-Einstellung konnte nicht bestätigt werden.')
  return body.data.groupAreaOrder
}

export async function updateAccountDefaultGroupArea(
  apiBase: string,
  defaultGroupArea: GroupArea,
  fetcher: typeof fetch = applicationFetch,
): Promise<GroupArea> {
  if (!isGroupArea(defaultGroupArea)) throw new Error('Invalid default group area')
  const response = await mutate(apiBase, '/api/account/preferences', 'PUT', { defaultGroupArea }, fetcher)
  const body = await json(response) as { data?: { defaultGroupArea?: unknown } } | null
  if (!isGroupArea(body?.data?.defaultGroupArea)) throw new AccountRequestError(response.status, 'Die Account-Einstellung konnte nicht bestätigt werden.')
  return body.data.defaultGroupArea
}

export async function updateAccountLanguagePreference(
  apiBase: string,
  languagePreference: LanguagePreference,
  fetcher: typeof fetch = applicationFetch,
): Promise<LanguagePreference> {
  const response = await mutate(apiBase, '/api/account/preferences', 'PUT', { languagePreference }, fetcher)
  const body = await json(response) as { data?: { languagePreference?: unknown } } | null
  if (!isLanguagePreference(body?.data?.languagePreference)) throw new AccountRequestError(response.status, 'Die Spracheinstellung des Accounts konnte nicht bestätigt werden.')
  return body.data.languagePreference
}

export async function persistHydratedWorkspace(response: AccountWorkspaceResponse, currentIdentityId: string): Promise<AccountHydration> {
  const groups: Group[] = response.groups.map(item => ({
    ...item.group,
    participantIds: [...item.participants].sort((a, b) => a.order - b.order).map(participant => participant.id),
  }))
  const identityIds = [...new Set([currentIdentityId, ...groups.map(group => group.ownerAccessIdentityId)])]
  const workspace: DurableAccountWorkspace = {
    accountId: response.account.id,
    name: response.account.name,
    email: response.account.email,
    accessIdentityIds: identityIds,
    groupRevisions: Object.fromEntries(response.groups.map(item => [item.group.id, item.revision])),
    personRevisions: Object.fromEntries(response.people.map(person => [person.id, person.revision])),
    conflictedGroupIds: [],
    lastSuccessfulSyncAt: new Date().toISOString(),
  }
  const hydration: AccountHydration = {
    identity: { id: currentIdentityId, credential: null, synchronizationStatus: 'account-linked' },
    workspace,
    groups,
    participants: response.groups.flatMap(item => item.participants),
    people: response.people,
    expenses: response.groups.flatMap(item => item.expenses),
    settlements: response.groups.flatMap(item => item.settlements),
  }
  validateDurableState({
    accessIdentity: hydration.identity, accountWorkspace: workspace,
    groups: [...hydration.groups], participants: [...hydration.participants], people: [...hydration.people], pendingPersonMutations: [], pendingMutations: [],
    expenses: [...hydration.expenses], settlements: [...hydration.settlements], settings: null,
  })
  await replaceWithAccountHydration(hydration)
  return hydration
}

export async function persistAccountWorkspaceAdditions(
  response: AccountWorkspaceResponse,
  currentIdentityId: string,
): Promise<AccountHydration> {
  const current = await loadDurableState()
  if (!current.accountWorkspace || current.accountWorkspace.accountId !== response.account.id || !current.accessIdentity) {
    throw new Error('Der Serverstand gehört nicht zum lokal gespeicherten Account.')
  }
  const localGroupIds = new Set(current.groups.map(group => group.id))
  const localPersonIds = new Set(current.people.map(person => person.id))
  const addedSnapshots = response.groups.filter(item => !localGroupIds.has(item.group.id))
  const addedGroupIds = new Set(addedSnapshots.map(item => item.group.id))
  const addedPeople = response.people.filter(person => !localPersonIds.has(person.id))
  const addedPersonIds = new Set(addedPeople.map(person => person.id))
  const addedGroups: Group[] = addedSnapshots.map(item => ({
    ...item.group,
    participantIds: [...item.participants].sort((a, b) => a.order - b.order).map(participant => participant.id),
  }))
  const workspace: DurableAccountWorkspace = {
    ...current.accountWorkspace,
    name: response.account.name,
    email: response.account.email,
    accessIdentityIds: [...new Set([
      ...current.accountWorkspace.accessIdentityIds,
      currentIdentityId,
      ...addedGroups.map(group => group.ownerAccessIdentityId),
    ])],
    groupRevisions: {
      ...current.accountWorkspace.groupRevisions,
      ...Object.fromEntries(addedSnapshots.map(item => [item.group.id, item.revision])),
    },
    personRevisions: {
      ...current.accountWorkspace.personRevisions,
      ...Object.fromEntries(addedPeople.map(person => [person.id, person.revision])),
    },
    lastSuccessfulSyncAt: new Date().toISOString(),
  }
  const hydration: AccountHydration = {
    identity: { id: currentIdentityId, credential: null, synchronizationStatus: 'account-linked' },
    workspace,
    groups: [...current.groups, ...addedGroups],
    participants: [...current.participants, ...addedSnapshots.flatMap(item => item.participants)],
    people: [...current.people, ...addedPeople],
    expenses: [...current.expenses, ...addedSnapshots.flatMap(item => item.expenses)],
    settlements: [...current.settlements, ...addedSnapshots.flatMap(item => item.settlements)],
  }
  validateDurableState({
    accessIdentity: hydration.identity,
    accountWorkspace: workspace,
    groups: [...hydration.groups],
    participants: [...hydration.participants],
    people: [...hydration.people],
    pendingPersonMutations: current.pendingPersonMutations,
    pendingMutations: current.pendingMutations,
    expenses: [...hydration.expenses],
    settlements: [...hydration.settlements],
    settings: current.settings,
  })
  await appendAccountHydration(hydration, addedGroupIds, addedPersonIds)
  return hydration
}

export async function logoutAccount(apiBase: string, fetcher: typeof fetch = applicationFetch): Promise<boolean> {
  await mutate(apiBase, '/api/account/logout', 'POST', undefined, fetcher)
  return clearNativeApiCookies(apiBase)
}

export async function changeAccountPassword(
  apiBase: string,
  currentPassword: string,
  password: string,
  passwordConfirmation: string,
  fetcher: typeof fetch = applicationFetch,
): Promise<void> {
  await mutate(apiBase, '/api/account/password', 'PUT', {
    currentPassword, password, password_confirmation: passwordConfirmation,
  }, fetcher)
}

export async function deleteAccount(apiBase: string, password: string, fetcher: typeof fetch = applicationFetch): Promise<boolean> {
  await mutate(apiBase, '/api/account', 'DELETE', { password }, fetcher)
  return clearNativeApiCookies(apiBase)
}
