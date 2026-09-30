import { describe, expect, it, vi } from 'vitest'
import { AccountRequestError, type AccountWorkspaceResponse, type GroupSnapshot } from '../../app/services/account'
import { adoptMissingAccountGroups } from '../../app/services/account-adoption'
import type { DurableAdoptionAttempt } from '../../app/persistence/database'

const localGroup = (id: string): Omit<GroupSnapshot, 'revision'> => ({
  group: {
    id,
    name: `Local ${id}`,
    currency: 'EUR',
    ownerAccessIdentityId: '10000000-0000-4000-8000-000000000001',
    status: 'active',
    hasFinancialHistory: false,
  },
  participants: [],
  expenses: [],
  settlements: [],
})

const workspace = (groupIds: readonly string[]): AccountWorkspaceResponse => ({
  account: {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Ada',
    email: 'ada@example.test',
    groupAreaOrder: ['people', 'expenses', 'settlement'],
    defaultGroupArea: 'expenses',
    languagePreference: 'system',
  },
  people: [],
  groups: groupIds.map((id, index) => ({ revision: index + 1, ...localGroup(id) })),
})

function attempt(groupIds: readonly string[]): DurableAdoptionAttempt {
  return {
    adoptionId: '30000000-0000-4000-8000-000000000001',
    imports: groupIds.map((groupId, index) => ({
      groupId,
      importId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      snapshot: localGroup(groupId),
    })),
  }
}

describe('Account Group adoption', () => {
  it('imports only local Groups missing from the Account and verifies the final workspace', async () => {
    const remoteId = '50000000-0000-4000-8000-000000000001'
    const linkedLocalId = '50000000-0000-4000-8000-000000000002'
    const localOnlyId = '50000000-0000-4000-8000-000000000003'
    const fetchWorkspace = vi.fn()
      .mockResolvedValueOnce(workspace([remoteId, linkedLocalId]))
      .mockResolvedValueOnce(workspace([remoteId, linkedLocalId, localOnlyId]))
    const importGroup = vi.fn().mockResolvedValue(undefined)

    const result = await adoptMissingAccountGroups({
      apiBase: '',
      attempt: attempt([linkedLocalId, localOnlyId]),
      fetchWorkspace,
      importGroup,
    })

    expect(importGroup).toHaveBeenCalledOnce()
    expect(importGroup.mock.calls[0]?.[3]).toEqual(localGroup(localOnlyId))
    expect(result.alreadyAvailableGroupIds).toEqual([linkedLocalId])
    expect(result.importedGroupIds).toEqual([localOnlyId])
    expect(result.workspace.groups.map(group => group.group.id)).toEqual([remoteId, linkedLocalId, localOnlyId])
  })

  it('does not accept an import conflict unless the Account workspace confirms the Group', async () => {
    const groupId = '60000000-0000-4000-8000-000000000001'
    const fetchWorkspace = vi.fn().mockResolvedValue(workspace([]))
    const importGroup = vi.fn().mockRejectedValue(new AccountRequestError(409, 'conflict'))

    await expect(adoptMissingAccountGroups({
      apiBase: '', attempt: attempt([groupId]), fetchWorkspace, importGroup,
    })).rejects.toThrow('conflict')
  })

  it('treats a lost successful import response as adopted after authenticated verification', async () => {
    const groupId = '70000000-0000-4000-8000-000000000001'
    const fetchWorkspace = vi.fn()
      .mockResolvedValueOnce(workspace([]))
      .mockResolvedValueOnce(workspace([groupId]))
      .mockResolvedValueOnce(workspace([groupId]))
    const importGroup = vi.fn().mockRejectedValue(new AccountRequestError(409, 'conflict'))

    const result = await adoptMissingAccountGroups({
      apiBase: '', attempt: attempt([groupId]), fetchWorkspace, importGroup,
    })

    expect(result.alreadyAvailableGroupIds).toEqual([groupId])
    expect(result.workspace.groups.map(group => group.group.id)).toEqual([groupId])
  })
})
