import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { prepareGroupCreation } from '../../app/domain/create-group'
import { synchronizeCreateGroup } from '../../app/services/create-group-sync'
import { useGroupsStore } from '../../app/stores/groups'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const CREDENTIAL = '0123456789abcdef'.repeat(4)

function serverBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: {
      group: {
        id: GROUP_ID,
        name: 'Wochenende',
        currency: 'EUR',
        status: 'active',
        ownerAccessIdentityId: ACTOR_ID,
      },
      initialParticipant: {
        id: PARTICIPANT_ID,
        groupId: GROUP_ID,
        name: 'Wolfgang',
        status: 'active',
        order: 0,
      },
      ...overrides,
    },
  }
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup() {
  const prepared = prepareGroupCreation(
    { groupName: 'Wochenende', addParticipant: true, participantName: 'Wolfgang' },
    ACTOR_ID,
    (() => {
      const values = [GROUP_ID, PARTICIPANT_ID]
      return () => values.shift()!
    })(),
  )
  expect(prepared.ok).toBe(true)
  if (!prepared.ok) throw new Error('Test setup failed')

  const groupsStore = useGroupsStore()
  groupsStore.commitCreation(prepared.value)

  return {
    groupsStore,
    options: {
      groupId: GROUP_ID,
      apiBase: 'http://127.0.0.1:8000/',
      identity: { accessIdentityId: ACTOR_ID, credential: CREDENTIAL },
      groupsStore,
      online: true,
    },
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('Create Group synchronization', () => {
  test('sends the immutable mutation with separated identity headers and no credential in JSON', async () => {
    const { groupsStore, options } = setup()
    groupsStore.groups[0]!.name = 'Später geändert'
    let requestUrl = ''
    let requestInit: RequestInit | undefined
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input)
      requestInit = init
      return jsonResponse(201, serverBody())
    }) as typeof fetch

    await synchronizeCreateGroup({ ...options, fetcher })

    expect(requestUrl).toBe('http://127.0.0.1:8000/api/groups')
    expect(requestInit?.headers).toMatchObject({
      'X-Access-Identity-ID': ACTOR_ID,
      Authorization: `Bearer ${CREDENTIAL}`,
    })
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      groupId: GROUP_ID,
      name: 'Wochenende',
      currency: 'EUR',
      actorId: ACTOR_ID,
      initialParticipant: { participantId: PARTICIPANT_ID, name: 'Wolfgang' },
    })
    expect(String(requestInit?.body)).not.toContain(CREDENTIAL)
  })

  test.each([201, 200] as const)('%i confirmation clears pending state without duplicating entities', async status => {
    const { groupsStore, options } = setup()

    const result = await synchronizeCreateGroup({
      ...options,
      fetcher: vi.fn(async () => jsonResponse(status, serverBody())) as typeof fetch,
    })

    expect(result).toEqual({ outcome: 'synced', status })
    expect(groupsStore.pendingCreateGroups).toHaveLength(0)
    expect(groupsStore.createGroupSync[GROUP_ID]).toEqual({ state: 'synced', error: null })
    expect(groupsStore.groups).toHaveLength(1)
    expect(groupsStore.participants).toHaveLength(1)
    expect(groupsStore.groups[0]?.id).toBe(GROUP_ID)
    expect(groupsStore.participants[0]?.id).toBe(PARTICIPANT_ID)
  })

  test('a mismatched Group response remains pending and becomes a reconciliation failure', async () => {
    const { groupsStore, options } = setup()
    const body = serverBody({
      group: {
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Wochenende',
        currency: 'EUR',
        status: 'active',
        ownerAccessIdentityId: ACTOR_ID,
      },
    })

    await synchronizeCreateGroup({
      ...options,
      fetcher: vi.fn(async () => jsonResponse(201, body)) as typeof fetch,
    })

    expect(groupsStore.hasPendingCreate(GROUP_ID)).toBe(true)
    expect(groupsStore.createGroupSync[GROUP_ID]?.state).toBe('failed')
    expect(groupsStore.createGroupSync[GROUP_ID]?.error?.kind).toBe('reconciliation')
  })

  test('a mismatched initial Participant response remains pending', async () => {
    const { groupsStore, options } = setup()
    const body = serverBody({
      initialParticipant: {
        id: '99999999-9999-4999-8999-999999999999',
        groupId: GROUP_ID,
        name: 'Wolfgang',
        status: 'active',
        order: 0,
      },
    })

    await synchronizeCreateGroup({
      ...options,
      fetcher: vi.fn(async () => jsonResponse(200, body)) as typeof fetch,
    })

    expect(groupsStore.hasPendingCreate(GROUP_ID)).toBe(true)
    expect(groupsStore.createGroupSync[GROUP_ID]?.error?.kind).toBe('reconciliation')
  })

  test('network failure keeps local data and the original pending mutation', async () => {
    const { groupsStore, options } = setup()
    const mutation = groupsStore.pendingCreateGroups[0]

    await synchronizeCreateGroup({
      ...options,
      fetcher: vi.fn(async () => { throw new TypeError('fetch failed') }) as typeof fetch,
    })

    expect(groupsStore.pendingCreateGroups[0]).toBe(mutation)
    expect(groupsStore.groups).toHaveLength(1)
    expect(groupsStore.participants).toHaveLength(1)
    expect(groupsStore.createGroupSync[GROUP_ID]?.error).toMatchObject({
      kind: 'network',
      retryable: true,
    })
  })

  test.each([
    [401, 'unauthorized', false],
    [409, 'conflict', false],
    [422, 'validation', false],
    [503, 'server', true],
    [418, 'unexpected', true],
  ] as const)('%i keeps the operation pending as %s', async (status, kind, retryable) => {
    const { groupsStore, options } = setup()

    await synchronizeCreateGroup({
      ...options,
      fetcher: vi.fn(async () => jsonResponse(status, { message: 'sensitive server detail' })) as typeof fetch,
    })

    expect(groupsStore.hasPendingCreate(GROUP_ID)).toBe(true)
    expect(groupsStore.createGroupSync[GROUP_ID]?.error).toMatchObject({ kind, retryable })
    expect(groupsStore.createGroupSync[GROUP_ID]?.error?.message).not.toContain('sensitive')
  })

  test('retry reuses the same IDs and payload and clears the prior failure', async () => {
    const { groupsStore, options } = setup()
    const bodies: string[] = []
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body))
      return bodies.length === 1 ? jsonResponse(503) : jsonResponse(200, serverBody())
    }) as typeof fetch

    await synchronizeCreateGroup({ ...options, fetcher })
    expect(groupsStore.createGroupSync[GROUP_ID]?.state).toBe('failed')
    await synchronizeCreateGroup({ ...options, fetcher })

    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toBe(bodies[0])
    expect(bodies[1]).toContain(GROUP_ID)
    expect(bodies[1]).toContain(PARTICIPANT_ID)
    expect(groupsStore.createGroupSync[GROUP_ID]).toEqual({ state: 'synced', error: null })
  })

  test('prevents concurrent requests for the same mutation', async () => {
    const { options } = setup()
    let resolveResponse!: (response: Response) => void
    const responsePromise = new Promise<Response>(resolve => { resolveResponse = resolve })
    const fetcher = vi.fn(async () => responsePromise) as typeof fetch

    const first = synchronizeCreateGroup({ ...options, fetcher })
    const second = await synchronizeCreateGroup({ ...options, fetcher })

    expect(second).toEqual({ outcome: 'busy' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolveResponse(jsonResponse(201, serverBody()))
    await expect(first).resolves.toEqual({ outcome: 'synced', status: 201 })
  })

  test('does not issue a request while the browser reports offline', async () => {
    const { groupsStore, options } = setup()
    const fetcher = vi.fn()

    const result = await synchronizeCreateGroup({ ...options, online: false, fetcher: fetcher as typeof fetch })

    expect(result).toEqual({ outcome: 'offline' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(groupsStore.hasPendingCreate(GROUP_ID)).toBe(true)
    expect(groupsStore.createGroupSync[GROUP_ID]?.state).toBe('pending')
  })
})
