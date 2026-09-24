import { calculateParticipantBalances } from '../domain/balance'
import {
  prepareSettlementDelete,
  prepareSettlementSave,
  serializeSettlement,
  type Settlement,
  type SettlementDraft,
} from '../domain/settlement'
import { persistSettlementDelete, persistSettlementSave } from '../persistence/database'
import { useAccessIdentityStore } from '../stores/access-identity'
import { useGroupsStore } from '../stores/groups'
import { serializeGroupLocalWrite } from './group-local-write'

interface SettlementDependencies {
  persistDelete: typeof persistSettlementDelete
  persistSave: typeof persistSettlementSave
}

export function useSettlements(dependencies: SettlementDependencies = {
  persistDelete: persistSettlementDelete,
  persistSave: persistSettlementSave,
}) {
  const groupsStore = useGroupsStore()
  const identityStore = useAccessIdentityStore()

  async function save(groupId: string, draft: SettlementDraft, existing?: Settlement, confirmationAccepted = false) {
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findGroup(groupId)
      const actorId = identityStore.accessIdentityId
      if (!group || group.status !== 'active' || !actorId) throw new Error('Active owned group required')
      const participants = groupsStore.participantsForGroup(groupId)
      const currentSettlement = existing && groupsStore.settlements.find(item => item.id === existing.id)
      if (existing && !currentSettlement) throw new Error('Settlement required')
      const settlementsBeforeCandidate = currentSettlement
        ? groupsStore.settlementsForGroup(groupId).filter(item => item.id !== currentSettlement.id)
        : groupsStore.settlementsForGroup(groupId)
      const balances = calculateParticipantBalances(groupId, participants, groupsStore.expensesForGroup(groupId), settlementsBeforeCandidate)
      const prepared = prepareSettlementSave({
        group, participants, pendingMutations: groupsStore.pendingMutations, actorId, draft,
        existing: currentSettlement, confirmationAccepted, createdOrder,
        balancesBeforeCandidate: new Map(balances.map(balance => [balance.participantId, balance.balanceAmountMinor])),
      })
      if (!prepared.ok) return prepared
      await dependencies.persistSave(prepared.group, serializeSettlement(prepared.settlement), prepared.mutation)
      groupsStore.commitSettlementSave(prepared.group, prepared.settlement, prepared.mutation)
      return prepared
    })
  }

  async function remove(settlement: Settlement): Promise<void> {
    await serializeGroupLocalWrite(groupsStore, settlement.groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findGroup(settlement.groupId)
      const current = groupsStore.settlements.find(item => item.id === settlement.id)
      if (!group || group.status !== 'active' || !current) throw new Error('Active group and Settlement required')
      const mutation = prepareSettlementDelete(current, groupsStore.pendingMutations, undefined, createdOrder)
      await dependencies.persistDelete(current.id, mutation)
      groupsStore.commitSettlementDelete(current.id, mutation)
    })
  }

  return { save, remove }
}
