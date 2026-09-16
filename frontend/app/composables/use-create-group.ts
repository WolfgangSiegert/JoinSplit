import {
  prepareGroupCreation,
  validateCreateGroupDraft,
  type CreateGroupDraft,
  type CreateGroupErrors,
} from '../domain/create-group'
import { useAccessIdentityStore } from '../stores/access-identity'
import { useGroupsStore } from '../stores/groups'

export function useCreateGroup() {
  const identityStore = useAccessIdentityStore()
  const groupsStore = useGroupsStore()

  function createGroup(draft: CreateGroupDraft):
    | { ok: true; groupId: string }
    | { ok: false; errors: CreateGroupErrors } {
    const validation = validateCreateGroupDraft(draft)
    if (validation.errors.groupName || validation.errors.participantName) {
      return { ok: false, errors: validation.errors }
    }

    const actorId = identityStore.ensureIdentity()
    const prepared = prepareGroupCreation(draft, actorId)
    if (!prepared.ok) {
      return prepared
    }

    const creation = prepared.value
    groupsStore.commitCreation(creation)

    return { ok: true, groupId: creation.group.id }
  }

  return { createGroup }
}
