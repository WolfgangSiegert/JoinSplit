import { canDeleteParticipant, prepareParticipantAdd, prepareParticipantDeactivate, prepareParticipantDelete, prepareParticipantRename } from '../domain/participant'
import { persistParticipantAdd, persistParticipantDelete, persistParticipantUpdate } from '../persistence/database'

export function useParticipants() {
  const groupsStore = useGroupsStore()

  async function add(groupId: string, name: string) {
    const group = groupsStore.findGroup(groupId)
    if (!group || group.status !== 'active') throw new Error('Active group required')
    const prepared = prepareParticipantAdd(group, groupsStore.participantsForGroup(groupId), groupsStore.pendingMutations, name)
    if (!prepared.ok) return prepared
    await persistParticipantAdd(prepared.value.group, prepared.value.participant, prepared.value.mutation)
    groupsStore.commitParticipantAdd(prepared.value.group, prepared.value.participant, prepared.value.mutation)
    return { ok: true as const, value: prepared.value }
  }

  async function rename(participantId: string, name: string) {
    const participant = groupsStore.participants.find(item => item.id === participantId)
    const group = participant && groupsStore.findGroup(participant.groupId)
    if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
    const prepared = prepareParticipantRename(participant, groupsStore.pendingMutations, name)
    if (!prepared.ok) return prepared
    await persistParticipantUpdate(prepared.value.participant, prepared.value.mutation)
    groupsStore.commitParticipantUpdate(prepared.value.participant, prepared.value.mutation)
    return { ok: true as const, value: prepared.value }
  }

  async function deactivate(participantId: string) {
    const participant = groupsStore.participants.find(item => item.id === participantId)
    const group = participant && groupsStore.findGroup(participant.groupId)
    if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
    const prepared = prepareParticipantDeactivate(participant, groupsStore.pendingMutations)
    await persistParticipantUpdate(prepared.participant, prepared.mutation)
    groupsStore.commitParticipantUpdate(prepared.participant, prepared.mutation)
  }

  async function remove(participantId: string) {
    const participant = groupsStore.participants.find(item => item.id === participantId)
    const group = participant && groupsStore.findGroup(participant.groupId)
    if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
    if (!canDeleteParticipant(false)) throw new Error('Participant cannot be deleted')
    const prepared = prepareParticipantDelete(group, participant, groupsStore.pendingMutations)
    await persistParticipantDelete(prepared.group, participant.id, prepared.mutation)
    groupsStore.commitParticipantDelete(prepared.group, participant.id, prepared.mutation)
  }

  return { add, rename, deactivate, remove }
}
