import { canDeleteParticipant, prepareParticipantAdd, prepareParticipantDeactivate, prepareParticipantDelete, prepareParticipantRename } from '../domain/participant'
import { participantHasFinancialReferences } from '../domain/expense'
import { persistParticipantAdd, persistParticipantDelete, persistParticipantUpdate } from '../persistence/database'
import { useGroupsStore } from '../stores/groups'
import { serializeGroupLocalWrite } from './group-local-write'

interface ParticipantDependencies {
  persistAdd: typeof persistParticipantAdd
  persistDelete: typeof persistParticipantDelete
  persistUpdate: typeof persistParticipantUpdate
}

export function useParticipants(dependencies: ParticipantDependencies = {
  persistAdd: persistParticipantAdd,
  persistDelete: persistParticipantDelete,
  persistUpdate: persistParticipantUpdate,
}) {
  const groupsStore = useGroupsStore()

  async function add(groupId: string, name: string) {
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findGroup(groupId)
      if (!group || group.status !== 'active') throw new Error('Active group required')
      const prepared = prepareParticipantAdd(group, groupsStore.participantsForGroup(groupId), groupsStore.pendingMutations, name, undefined, createdOrder)
      if (!prepared.ok) return prepared
      await dependencies.persistAdd(prepared.value.group, prepared.value.participant, prepared.value.mutation)
      groupsStore.commitParticipantAdd(prepared.value.group, prepared.value.participant, prepared.value.mutation)
      return { ok: true as const, value: prepared.value }
    })
  }

  async function rename(participantId: string, name: string) {
    const groupId = groupsStore.participants.find(item => item.id === participantId)?.groupId
    if (!groupId) throw new Error('Active group and participant required')
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const participant = groupsStore.participants.find(item => item.id === participantId)
      const group = participant && groupsStore.findGroup(participant.groupId)
      if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
      const prepared = prepareParticipantRename(participant, groupsStore.pendingMutations, name, undefined, createdOrder)
      if (!prepared.ok) return prepared
      await dependencies.persistUpdate(prepared.value.participant, prepared.value.mutation)
      groupsStore.commitParticipantUpdate(prepared.value.participant, prepared.value.mutation)
      return { ok: true as const, value: prepared.value }
    })
  }

  async function deactivate(participantId: string) {
    const groupId = groupsStore.participants.find(item => item.id === participantId)?.groupId
    if (!groupId) throw new Error('Active group and participant required')
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const participant = groupsStore.participants.find(item => item.id === participantId)
      const group = participant && groupsStore.findGroup(participant.groupId)
      if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
      const prepared = prepareParticipantDeactivate(participant, groupsStore.pendingMutations, undefined, createdOrder)
      await dependencies.persistUpdate(prepared.participant, prepared.mutation)
      groupsStore.commitParticipantUpdate(prepared.participant, prepared.mutation)
    })
  }

  async function remove(participantId: string) {
    const groupId = groupsStore.participants.find(item => item.id === participantId)?.groupId
    if (!groupId) throw new Error('Active group and participant required')
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const participant = groupsStore.participants.find(item => item.id === participantId)
      const group = participant && groupsStore.findGroup(participant.groupId)
      if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
      if (!canDeleteParticipant(participantHasFinancialReferences(participant.id, groupsStore.expenses))) throw new Error('Participant cannot be deleted')
      const prepared = prepareParticipantDelete(group, participant, groupsStore.pendingMutations, undefined, createdOrder)
      await dependencies.persistDelete(prepared.group, participant.id, prepared.mutation)
      groupsStore.commitParticipantDelete(prepared.group, participant.id, prepared.mutation)
    })
  }

  return { add, rename, deactivate, remove }
}
