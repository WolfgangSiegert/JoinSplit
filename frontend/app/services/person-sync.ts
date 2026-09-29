import type { PendingPersonMutation } from '../domain/pending-person-mutation'
import { acknowledgePersonMutation } from '../persistence/database'
import type { usePeopleStore } from '../stores/people'
import { applicationFetch } from './http-transport'

async function csrf(apiBase: string, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(`${apiBase.replace(/\/$/u, '')}/api/account/csrf`, {
    headers: { Accept: 'application/json' }, credentials: 'include',
  })
  const body = await response.json() as { data?: { csrfToken?: unknown } }
  if (!response.ok || typeof body.data?.csrfToken !== 'string') throw new Error('Person CSRF bootstrap failed')
  return body.data.csrfToken
}

export async function synchronizePersonMutation(options: {
  apiBase: string
  mutation: PendingPersonMutation
  peopleStore: ReturnType<typeof usePeopleStore>
  fetcher?: typeof fetch
}): Promise<'synced' | 'conflict' | 'session-expired' | 'failed'> {
  const fetcher = options.fetcher ?? applicationFetch
  try {
    const token = await csrf(options.apiBase, fetcher)
    const mutation = options.mutation
    const root = options.apiBase.replace(/\/$/u, '')
    const creating = mutation.type === 'SavePerson' && mutation.baseRevision === 0
    const response = await fetcher(`${root}/api/account/workspace/people${creating ? '' : `/${mutation.personId}`}`, {
      method: mutation.type === 'DeletePerson' ? 'DELETE' : creating ? 'POST' : 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token,
        'X-Mutation-ID': mutation.id, 'X-Person-Revision': String(mutation.baseRevision),
      },
      body: mutation.type === 'SavePerson' ? JSON.stringify({ person: {
        id: mutation.payload.person.id, name: mutation.payload.person.name, status: mutation.payload.person.status,
      } }) : undefined,
    })
    if (response.status === 409 || response.status === 404) {
      options.peopleStore.conflict(mutation.personId)
      return 'conflict'
    }
    if (response.status === 401) return 'session-expired'
    const revision = Number(response.headers.get('X-Person-Revision'))
    if (!response.ok || !Number.isSafeInteger(revision) || revision < 1) return 'failed'
    await acknowledgePersonMutation(mutation.id, mutation.personId, revision, mutation.type === 'DeletePerson')
    options.peopleStore.acknowledge(mutation.id, mutation.personId, revision)
    return 'synced'
  } catch {
    return 'failed'
  }
}
