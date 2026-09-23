import {
  prepareGroupCreation,
  validateCreateGroupDraft,
  type CreateGroupDraft,
  type CreateGroupErrors,
} from '../domain/create-group'
import { useAccessIdentityStore } from '../stores/access-identity'
import { useGroupsStore } from '../stores/groups'
import { persistGroupCreation } from '../persistence/database'
import { prepareCreateGroupMutation } from '../domain/pending-mutation'
import { reserveLocalMutationOrder } from './group-local-write'

interface CreateGroupDependencies {
  persistCreation: typeof persistGroupCreation
}

export function useCreateGroup(dependencies: CreateGroupDependencies = {
  persistCreation: persistGroupCreation,
}) {
  const identityStore = useAccessIdentityStore()
  const groupsStore = useGroupsStore()

  async function createGroup(draft: CreateGroupDraft): Promise<
    | { ok: true; groupId: string }
    | { ok: false; errors: CreateGroupErrors }
  > {
    const validation = validateCreateGroupDraft(draft)
    if (validation.errors.groupName || validation.errors.participantName) {
      return { ok: false, errors: validation.errors }
    }

    const actorId = identityStore.accessIdentityId
    if (!actorId || !identityStore.credential) {
      throw new Error('Access identity is not ready')
    }
    const prepared = prepareGroupCreation(draft, actorId)
    if (!prepared.ok) {
      return prepared
    }

    const creation = prepared.value
    const createdOrder = reserveLocalMutationOrder(groupsStore, groupsStore.pendingMutations)
    const mutation = prepareCreateGroupMutation(creation.payload, groupsStore.pendingMutations, undefined, createdOrder)
    await dependencies.persistCreation(creation, mutation)
    groupsStore.commitCreation(creation, mutation)

    return { ok: true, groupId: creation.group.id }
  }

  return { createGroup }
}
