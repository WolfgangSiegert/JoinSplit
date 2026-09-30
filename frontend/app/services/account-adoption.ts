import type { DurableAdoptionAttempt } from '../persistence/database'
import {
  AccountRequestError,
  fetchAccountWorkspace,
  importAccountGroup,
  type AccountWorkspaceResponse,
  type GroupSnapshot,
} from './account'

export interface AccountGroupAdoptionResult {
  readonly workspace: AccountWorkspaceResponse
  readonly alreadyAvailableGroupIds: readonly string[]
  readonly importedGroupIds: readonly string[]
}

interface AdoptMissingAccountGroupsOptions {
  readonly apiBase: string
  readonly attempt: DurableAdoptionAttempt
  readonly onProgress?: (completed: number, total: number) => void
  readonly fetchWorkspace?: typeof fetchAccountWorkspace
  readonly importGroup?: typeof importAccountGroup
}

/**
 * Links/imports only Groups that are absent from the authenticated Account.
 * Existing server Groups are deliberately never overwritten with a local snapshot.
 */
export async function adoptMissingAccountGroups(
  options: AdoptMissingAccountGroupsOptions,
): Promise<AccountGroupAdoptionResult> {
  const fetchWorkspace = options.fetchWorkspace ?? fetchAccountWorkspace
  const importGroup = options.importGroup ?? importAccountGroup
  let workspace = await fetchWorkspace(options.apiBase)
  let serverGroupIds = new Set(workspace.groups.map(item => item.group.id))
  const alreadyAvailableGroupIds = options.attempt.imports
    .filter(item => serverGroupIds.has(item.groupId))
    .map(item => item.groupId)
  const missingImports = options.attempt.imports.filter(item => !serverGroupIds.has(item.groupId))
  const importedGroupIds: string[] = []

  options.onProgress?.(0, missingImports.length)
  for (const [index, item] of missingImports.entries()) {
    try {
      await importGroup(
        options.apiBase,
        options.attempt.adoptionId,
        item.importId,
        item.snapshot as Omit<GroupSnapshot, 'revision'>,
      )
      importedGroupIds.push(item.groupId)
    } catch (error) {
      // A retry may race with an earlier successful request whose response was lost.
      // Treat it as success only after the authenticated workspace confirms ownership.
      if (!(error instanceof AccountRequestError && error.status === 409)) throw error
      workspace = await fetchWorkspace(options.apiBase)
      serverGroupIds = new Set(workspace.groups.map(group => group.group.id))
      if (!serverGroupIds.has(item.groupId)) throw error
      alreadyAvailableGroupIds.push(item.groupId)
    }
    options.onProgress?.(index + 1, missingImports.length)
  }

  if (missingImports.length > 0) workspace = await fetchWorkspace(options.apiBase)
  serverGroupIds = new Set(workspace.groups.map(item => item.group.id))
  const notAdopted = options.attempt.imports.filter(item => !serverGroupIds.has(item.groupId))
  if (notAdopted.length > 0) {
    throw new Error(`${notAdopted.length} lokale Gruppe(n) konnten dem Account nicht sicher zugeordnet werden. Die lokale Kopie bleibt erhalten.`)
  }

  return { workspace, alreadyAvailableGroupIds, importedGroupIds }
}
