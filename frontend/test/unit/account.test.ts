import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { prepareGroupCreation } from '../../app/domain/create-group'
import { registerAccount } from '../../app/services/account'
import { synchronizeCreateGroup } from '../../app/services/create-group-sync'
import { useGroupsStore } from '../../app/stores/groups'

const GROUP_ID = '51000000-0000-4000-8000-000000000001'
const PARTICIPANT_ID = '51000000-0000-4000-8000-000000000002'
const IDENTITY_ID = '51000000-0000-4000-8000-000000000003'

beforeEach(() => setActivePinia(createPinia()))

describe('Account client boundary', () => {
  test('registers with a cookie session and CSRF without exposing an Account token', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { csrfToken: 'csrf-token' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'account-id', email: 'owner@example.test' } }), { status: 201 })) as typeof fetch

    await expect(registerAccount('https://example.test/', 'owner@example.test', 'correct horse battery staple', fetcher))
      .resolves.toEqual({ id: 'account-id', email: 'owner@example.test' })

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://example.test/api/account/csrf', expect.objectContaining({ credentials: 'include' }))
    const registration = vi.mocked(fetcher).mock.calls[1]
    expect(registration?.[0]).toBe('https://example.test/api/account/register')
    expect(registration?.[1]).toMatchObject({ credentials: 'include', method: 'POST' })
    expect(registration?.[1]?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'csrf-token' })
    expect(String(registration?.[1]?.body)).not.toContain('token')
  })

  test('sends Account mutations with revision and idempotency headers', async () => {
    const prepared = prepareGroupCreation(
      { groupName: 'Mehrgerät', addParticipant: true, participantName: 'Ava' },
      IDENTITY_ID,
      (() => { const ids = [GROUP_ID, PARTICIPANT_ID]; return () => ids.shift()! })(),
    )
    if (!prepared.ok) throw new Error('Test setup failed')
    const groupsStore = useGroupsStore()
    groupsStore.commitCreation(prepared.value)
    const mutation = groupsStore.findPendingCreate(GROUP_ID)!
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { csrfToken: 'csrf-token' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          group: { id: GROUP_ID, name: 'Mehrgerät', currency: 'EUR', status: 'active', ownerAccessIdentityId: IDENTITY_ID },
          initialParticipant: { id: PARTICIPANT_ID, groupId: GROUP_ID, name: 'Ava', status: 'active', order: 0 },
        },
      }), { status: 201, headers: { 'X-Group-Revision': '1' } })) as typeof fetch

    await expect(synchronizeCreateGroup({
      groupId: GROUP_ID,
      apiBase: 'https://example.test',
      identity: { accessIdentityId: IDENTITY_ID, credential: null },
      groupsStore,
      online: true,
      fetcher,
      acknowledge: vi.fn(async () => {}),
    })).resolves.toEqual({ outcome: 'synced', status: 201 })

    const request = vi.mocked(fetcher).mock.calls[1]
    expect(request?.[0]).toBe('https://example.test/api/account/workspace/groups')
    expect(request?.[1]).toMatchObject({ credentials: 'include' })
    expect(request?.[1]?.headers).toMatchObject({
      'X-CSRF-TOKEN': 'csrf-token',
      'X-Mutation-ID': mutation.id,
      'X-Group-Revision': '0',
    })
    expect(groupsStore.groupRevisions[GROUP_ID]).toBe(1)
  })
})
