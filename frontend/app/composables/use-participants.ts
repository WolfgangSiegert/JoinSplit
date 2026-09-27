import { canDeleteParticipant, prepareParticipantAdd, prepareParticipantAssociation, prepareParticipantDeactivate, prepareParticipantDelete, prepareParticipantReactivate, prepareParticipantRename } from '../domain/participant'
import { participantHasFinancialReferences } from '../domain/expense'
import { participantHasSettlementReferences } from '../domain/settlement'
import { persistParticipantAdd, persistParticipantAssociation, persistParticipantDelete, persistParticipantUpdate } from '../persistence/database'
import { useGroupsStore } from '../stores/groups'
import { useAccountStore } from '../stores/account'
import { serializeGroupLocalWrite } from './group-local-write'

interface ParticipantDependencies {
  persistAdd: typeof persistParticipantAdd
  persistDelete: typeof persistParticipantDelete
  persistUpdate: typeof persistParticipantUpdate
  persistAssociation?: typeof persistParticipantAssociation
}

export function useParticipants(dependencies: ParticipantDependencies = {
  persistAdd: persistParticipantAdd,
  persistDelete: persistParticipantDelete,
  persistUpdate: persistParticipantUpdate,
  persistAssociation: persistParticipantAssociation,
}) {
  const groupsStore = useGroupsStore()
  const accountStore = useAccountStore()

  async function add(groupId: string, name: string, personId?: string) {
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findGroup(groupId)
      if (!group || group.status !== 'active') throw new Error('Active group required')
      const participants = groupsStore.participantsForGroup(groupId)
      if (personId && participants.some(participant => participant.personId === personId)) {
        throw new Error('Person already belongs to group')
      }
      const prepared = prepareParticipantAdd(group, participants, groupsStore.pendingMutations, name, undefined, createdOrder, personId)
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

  async function reactivate(participantId: string) {
    const groupId = groupsStore.participants.find(item => item.id === participantId)?.groupId
    if (!groupId) throw new Error('Active group and participant required')
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const participant = groupsStore.participants.find(item => item.id === participantId)
      const group = participant && groupsStore.findGroup(participant.groupId)
      if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
      const prepared = prepareParticipantReactivate(participant, groupsStore.pendingMutations, undefined, createdOrder)
      await dependencies.persistUpdate(prepared.participant, prepared.mutation)
      groupsStore.commitParticipantUpdate(prepared.participant, prepared.mutation)
    })
  }

  async function associate(participantId: string, personId: string | null) {
    const groupId = groupsStore.participants.find(item => item.id === participantId)?.groupId
    if (!groupId) throw new Error('Active group and participant required')
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const participant = groupsStore.participants.find(item => item.id === participantId)
      const group = participant && groupsStore.findGroup(participant.groupId)
      if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
      if (personId && groupsStore.participantsForGroup(groupId).some(item => item.id !== participantId && item.personId === personId)) {
        throw new Error('Person already belongs to group')
      }
      const prepared = prepareParticipantAssociation(participant, groupsStore.pendingMutations, personId, undefined, createdOrder)
      if (accountStore.isAuthenticated) {
        await dependencies.persistUpdate(prepared.participant, prepared.mutation)
        groupsStore.commitParticipantUpdate(prepared.participant, prepared.mutation)
      } else {
        await (dependencies.persistAssociation ?? persistParticipantAssociation)(prepared.participant)
        groupsStore.participants = groupsStore.participants.map(item => item.id === participantId ? prepared.participant : item)
      }
      return prepared.participant
    })
  }

  async function remove(participantId: string) {
    const groupId = groupsStore.participants.find(item => item.id === participantId)?.groupId
    if (!groupId) throw new Error('Active group and participant required')
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const participant = groupsStore.participants.find(item => item.id === participantId)
      const group = participant && groupsStore.findGroup(participant.groupId)
      if (!participant || !group || group.status !== 'active') throw new Error('Active group and participant required')
      if (!canDeleteParticipant(participantHasFinancialReferences(participant.id, groupsStore.expenses)
        || participantHasSettlementReferences(participant.id, groupsStore.settlements))) throw new Error('Participant cannot be deleted')
      const prepared = prepareParticipantDelete(group, participant, groupsStore.pendingMutations, undefined, createdOrder)
      await dependencies.persistDelete(prepared.group, participant.id, prepared.mutation)
      groupsStore.commitParticipantDelete(prepared.group, participant.id, prepared.mutation)
    })
  }

  return { add, rename, deactivate, reactivate, associate, remove }
}
