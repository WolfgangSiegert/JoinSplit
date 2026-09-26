import type { Group, Participant } from '../domain/create-group'
import type { PendingAddParticipant, PendingCreateGroup, PendingDeactivateParticipant, PendingDeleteParticipant, PendingMutation, PendingRenameParticipant } from '../domain/pending-mutation'
import type { DurableState } from './database'
import { normalizeName } from '../domain/create-group'
import type { Expense } from '../domain/expense'
import { isCalendarDate } from '../domain/expense'
import { isCanonicalPositiveMinor, type DurableSettlementSnapshot } from '../domain/settlement'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SERVER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const CREDENTIAL = /^[0-9a-f]{64}$/u
const TYPES = new Set(['CreateGroup', 'AddParticipant', 'RenameParticipant', 'DeactivateParticipant', 'DeleteParticipant', 'CreateExpense', 'UpdateExpense', 'DeleteExpense', 'CreateSettlement', 'UpdateSettlement', 'DeleteSettlement', 'ArchiveGroup', 'ReactivateGroup', 'DeleteGroup'])
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value); return actual.length === expected.length && actual.every(key => expected.includes(key))
}
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID_V4.test(value) }
function name(value: unknown): value is string { return typeof value === 'string' && normalizeName(value) === value && Array.from(value).length >= 1 && Array.from(value).length <= 100 }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 }

function group(value: unknown): value is Group {
  return record(value) && keys(value, ['id', 'name', 'currency', 'ownerAccessIdentityId', 'status', 'participantIds', 'hasFinancialHistory'])
    && uuid(value.id) && name(value.name) && value.currency === 'EUR' && uuid(value.ownerAccessIdentityId)
    && (value.status === 'active' || value.status === 'archived') && typeof value.hasFinancialHistory === 'boolean' && Array.isArray(value.participantIds) && value.participantIds.every(uuid)
    && new Set(value.participantIds).size === value.participantIds.length
}

function participant(value: unknown): value is Participant {
  return record(value) && keys(value, ['id', 'groupId', 'name', 'status', 'order'])
    && uuid(value.id) && uuid(value.groupId) && name(value.name)
    && (value.status === 'active' || value.status === 'inactive') && integer(value.order)
}

function mutation(value: unknown): value is PendingMutation {
  if (!record(value) || !keys(value, ['id', 'type', 'groupId', 'createdOrder', 'payload'])
    || !uuid(value.id) || typeof value.type !== 'string' || !TYPES.has(value.type)
    || !uuid(value.groupId) || !integer(value.createdOrder) || !record(value.payload)) return false
  const payload = value.payload
  if (value.type === 'CreateExpense' || value.type === 'UpdateExpense' || value.type === 'DeleteExpense') {
    return keys(payload, ['expense']) && expense(payload.expense) && payload.expense.groupId === value.groupId
  }
  if (value.type === 'CreateSettlement' || value.type === 'UpdateSettlement' || value.type === 'DeleteSettlement') {
    return keys(payload, ['settlement']) && durableSettlement(payload.settlement) && payload.settlement.groupId === value.groupId
  }
  if (value.type === 'CreateGroup') {
    if (!keys(payload, ['groupId', 'name', 'currency', 'actorId', 'initialParticipant'])
      || payload.groupId !== value.groupId || !name(payload.name) || payload.currency !== 'EUR' || !uuid(payload.actorId)) return false
    return payload.initialParticipant === null || (record(payload.initialParticipant)
      && keys(payload.initialParticipant, ['participantId', 'name'])
      && uuid(payload.initialParticipant.participantId) && name(payload.initialParticipant.name))
  }
  if (value.type === 'ArchiveGroup') return keys(payload, ['status']) && payload.status === 'archived'
  if (value.type === 'ReactivateGroup') return keys(payload, ['status']) && payload.status === 'active'
  if (value.type === 'DeleteGroup') return keys(payload, [])
  if (value.type === 'AddParticipant') return keys(payload, ['participantId', 'name', 'order']) && uuid(payload.participantId) && name(payload.name) && integer(payload.order)
  if (value.type === 'RenameParticipant') return keys(payload, ['participantId', 'name', 'active', 'order'])
    && uuid(payload.participantId) && name(payload.name) && typeof payload.active === 'boolean' && integer(payload.order)
  if (value.type === 'DeactivateParticipant') return keys(payload, ['participantId', 'name', 'active', 'order'])
    && uuid(payload.participantId) && name(payload.name) && payload.active === false && integer(payload.order)
  return keys(payload, ['participantId']) && uuid(payload.participantId)
}

export function durableSettlement(value: unknown): value is DurableSettlementSnapshot {
  return record(value) && keys(value, ['id', 'groupId', 'senderParticipantId', 'receiverParticipantId', 'amountMinor', 'occurredOn', 'creatorAccessIdentityId'])
    && uuid(value.id) && uuid(value.groupId) && uuid(value.senderParticipantId) && uuid(value.receiverParticipantId)
    && value.senderParticipantId !== value.receiverParticipantId && isCanonicalPositiveMinor(value.amountMinor)
    && typeof value.occurredOn === 'string' && isCalendarDate(value.occurredOn) && uuid(value.creatorAccessIdentityId)
}

function expense(value: unknown): value is Expense {
  if (!record(value) || !keys(value, ['id', 'groupId', 'description', 'amountMinor', 'incurredOn', 'payerParticipantId', 'creatorAccessIdentityId', 'splitMethod', 'shares'])
    || !uuid(value.id) || !uuid(value.groupId) || !uuid(value.payerParticipantId) || !uuid(value.creatorAccessIdentityId)
    || typeof value.description !== 'string' || normalizeName(value.description) !== value.description || Array.from(value.description).length < 1 || Array.from(value.description).length > 200
    || !Number.isSafeInteger(value.amountMinor) || (value.amountMinor as number) <= 0 || !isCalendarDate(value.incurredOn as string) || value.splitMethod !== 'equal' || !Array.isArray(value.shares) || !value.shares.length) return false
  return value.shares.every(share => record(share) && keys(share, ['participantId', 'amountMinor']) && uuid(share.participantId) && integer(share.amountMinor))
}

export function validateDurableState(value: DurableState): DurableState {
  const identity = value.accessIdentity
  if (identity !== null && (!uuid(identity.id)
    || (identity.synchronizationStatus === 'account-linked'
      ? identity.credential !== null
      : typeof identity.credential !== 'string' || !CREDENTIAL.test(identity.credential))
    || !['never-synchronized', 'registered', 'expired-local-only', 'account-linked'].includes(identity.synchronizationStatus))) {
    throw new Error('Invalid persisted access identity')
  }
  const workspace = value.accountWorkspace ?? null
  if (workspace !== null && (typeof workspace.accountId !== 'string' || !SERVER_UUID.test(workspace.accountId)
    || typeof workspace.email !== 'string' || !workspace.email.includes('@')
    || !Array.isArray(workspace.accessIdentityIds) || !workspace.accessIdentityIds.every(uuid)
    || new Set(workspace.accessIdentityIds).size !== workspace.accessIdentityIds.length
    || !record(workspace.groupRevisions) || Object.entries(workspace.groupRevisions).some(([id, revision]) => !uuid(id) || !integer(revision))
    || !Array.isArray(workspace.conflictedGroupIds) || !workspace.conflictedGroupIds.every(uuid))) {
    throw new Error('Invalid persisted Account workspace')
  }
  if ((workspace === null) !== (identity?.synchronizationStatus !== 'account-linked')) throw new Error('Account workspace and identity mode mismatch')
  if (!value.groups.every(group) || !value.participants.every(participant) || !value.pendingMutations.every(mutation)
    || !value.expenses.every(expense)
    || !value.settlements.every(durableSettlement)
    || (value.settings !== null && (typeof value.settings.addSelfAsParticipantByDefault !== 'boolean'
      || (value.settings.settlementProposalStrategy !== 'deterministic' && value.settings.settlementProposalStrategy !== 'minimum-transfer')
      || (value.settings.colorMode !== 'system' && value.settings.colorMode !== 'light' && value.settings.colorMode !== 'dark')
      || (value.settings.visualDesign !== '2' && value.settings.visualDesign !== '3')))) throw new Error('Invalid persisted state shape')

  const groupIds = new Set(value.groups.map(item => item.id)); const participantIds = new Set(value.participants.map(item => item.id))
  const expenseIds = new Set(value.expenses.map(item => item.id))
  const settlementIds = new Set(value.settlements.map(item => item.id))
  const mutationIds = new Set(value.pendingMutations.map(item => item.id)); const createdOrders = new Set(value.pendingMutations.map(item => item.createdOrder))
  if (groupIds.size !== value.groups.length || participantIds.size !== value.participants.length
    || expenseIds.size !== value.expenses.length || settlementIds.size !== value.settlements.length
    || mutationIds.size !== value.pendingMutations.length || createdOrders.size !== value.pendingMutations.length) throw new Error('Duplicate persisted identifiers or queue order')
  if ([...groupIds].some(id => participantIds.has(id))) throw new Error('Persisted group and participant identifiers collide')
  if (!identity && (value.groups.length || value.participants.length || value.pendingMutations.length || value.expenses.length || value.settlements.length)) throw new Error('Persisted domain state has no access identity')
  const authorizedIdentityIds = new Set(workspace?.accessIdentityIds ?? (identity ? [identity.id] : []))
  if (identity && !authorizedIdentityIds.has(identity.id)) throw new Error('Current identity is not part of the Account workspace')

  for (const currentGroup of value.groups) {
    if (!authorizedIdentityIds.has(currentGroup.ownerAccessIdentityId)) throw new Error('Persisted group owner does not match an authorized identity')
    const ordered = value.participants.filter(item => item.groupId === currentGroup.id).sort((a, b) => a.order - b.order)
    if (new Set(ordered.map(item => item.order)).size !== ordered.length
      || ordered.map(item => item.id).join('|') !== currentGroup.participantIds.join('|')) throw new Error('Persisted group participant ordering is inconsistent')
  }
  for (const currentGroup of value.groups) {
    const lifecycle = [...value.pendingMutations]
      .filter(mutation => mutation.groupId === currentGroup.id
        && (mutation.type === 'ArchiveGroup' || mutation.type === 'ReactivateGroup'))
      .sort((left, right) => left.createdOrder - right.createdOrder)
    const latest = lifecycle.at(-1)
    const expectedStatus = latest?.type === 'ArchiveGroup' ? 'archived'
      : latest?.type === 'ReactivateGroup' ? 'active' : undefined
    if (expectedStatus && currentGroup.status !== expectedStatus) throw new Error('Persisted Group lifecycle mismatch')
    if (lifecycle.some(mutation => mutation.type === 'ArchiveGroup') && !currentGroup.hasFinancialHistory) {
      throw new Error('Persisted Group archive history mismatch')
    }
    const deletion = value.pendingMutations.find(mutation => mutation.groupId === currentGroup.id && mutation.type === 'DeleteGroup')
    if (deletion) {
      if (currentGroup.status !== 'active' || currentGroup.hasFinancialHistory
        || value.expenses.some(expense => expense.groupId === currentGroup.id)
        || value.settlements.some(settlement => settlement.groupId === currentGroup.id)
        || value.pendingMutations.some(mutation => mutation.groupId === currentGroup.id && mutation.id !== deletion.id)) {
        throw new Error('Persisted Group deletion tombstone mismatch')
      }
    }
  }
  if (value.participants.some(item => !groupIds.has(item.groupId))) throw new Error('Persisted participant has no group')
  for (const currentExpense of value.expenses) {
    const currentGroup = value.groups.find(item => item.id === currentExpense.groupId)
    if (!currentGroup || !authorizedIdentityIds.has(currentExpense.creatorAccessIdentityId)) throw new Error('Persisted Expense ownership mismatch')
    const groupParticipants = value.participants.filter(item => item.groupId === currentExpense.groupId).sort((a, b) => a.order - b.order)
    const participantOrder = new Map(groupParticipants.map((item, index) => [item.id, index]))
    if (!participantOrder.has(currentExpense.payerParticipantId) || currentExpense.shares.some(share => !participantOrder.has(share.participantId))) throw new Error('Persisted Expense Participant mismatch')
    if (new Set(currentExpense.shares.map(share => share.participantId)).size !== currentExpense.shares.length) throw new Error('Duplicate persisted ExpenseShare identity')
    const order = currentExpense.shares.map(share => participantOrder.get(share.participantId)!)
    if (order.some((value, index) => index > 0 && value <= order[index - 1]!)) throw new Error('Persisted ExpenseShare order mismatch')
    if (currentExpense.shares.reduce((sum, share) => sum + share.amountMinor, 0) !== currentExpense.amountMinor) throw new Error('Persisted ExpenseShare sum mismatch')
    if (!currentGroup.hasFinancialHistory) throw new Error('Persisted Group financial history mismatch')
  }
  for (const currentSettlement of value.settlements) {
    const currentGroup = value.groups.find(item => item.id === currentSettlement.groupId)
    if (!currentGroup || !authorizedIdentityIds.has(currentSettlement.creatorAccessIdentityId)) throw new Error('Persisted Settlement ownership mismatch')
    const participantIdsForGroup = new Set(value.participants.filter(item => item.groupId === currentSettlement.groupId).map(item => item.id))
    if (!participantIdsForGroup.has(currentSettlement.senderParticipantId) || !participantIdsForGroup.has(currentSettlement.receiverParticipantId)) throw new Error('Persisted Settlement Participant mismatch')
    if (!currentGroup.hasFinancialHistory) throw new Error('Persisted Group financial history mismatch')
  }

  const orderedMutations = [...value.pendingMutations].sort((a, b) => a.createdOrder - b.createdOrder)
  type ParticipantStateMutation = PendingCreateGroup | PendingAddParticipant | PendingRenameParticipant | PendingDeactivateParticipant | PendingDeleteParticipant
  const latestParticipantMutation = new Map<string, ParticipantStateMutation>()
  for (const current of orderedMutations) {
    const currentGroup = value.groups.find(item => item.id === current.groupId)
    if (!currentGroup) throw new Error('Persisted mutation has no group')
    if (current.type === 'ArchiveGroup' || current.type === 'ReactivateGroup' || current.type === 'DeleteGroup') continue
    if (current.type === 'CreateGroup') {
      if (!authorizedIdentityIds.has(current.payload.actorId) || current.payload.name !== currentGroup.name) throw new Error('Persisted CreateGroup mismatch')
      const initial = current.payload.initialParticipant
      if (initial) {
        latestParticipantMutation.set(initial.participantId, current)
      }
      continue
    }
    if (current.type === 'CreateExpense' || current.type === 'UpdateExpense' || current.type === 'DeleteExpense') {
      const local = value.expenses.find(item => item.id === current.payload.expense.id)
      if (current.type === 'DeleteExpense') {
        if (local) throw new Error('Persisted DeleteExpense local state mismatch')
      } else {
        const newer = orderedMutations.some(item => item.createdOrder > current.createdOrder && (item.type === 'CreateExpense' || item.type === 'UpdateExpense' || item.type === 'DeleteExpense') && item.payload.expense.id === current.payload.expense.id)
        if (!newer && JSON.stringify(local) !== JSON.stringify(current.payload.expense)) throw new Error(`Persisted ${current.type} local state mismatch`)
      }
      continue
    }
    if (current.type === 'CreateSettlement' || current.type === 'UpdateSettlement' || current.type === 'DeleteSettlement') {
      const snapshot = current.payload.settlement
      if (!authorizedIdentityIds.has(snapshot.creatorAccessIdentityId)) throw new Error('Persisted Settlement mutation ownership mismatch')
      const participantBelongedToGroup = (participantId: string): boolean => {
        const localParticipant = value.participants.find(item => item.id === participantId)
        if (localParticipant) return localParticipant.groupId === current.groupId
        return orderedMutations.some(item => item.createdOrder > current.createdOrder
          && item.groupId === current.groupId && item.type === 'DeleteParticipant'
          && item.payload.participantId === participantId)
      }
      if (!participantBelongedToGroup(snapshot.senderParticipantId) || !participantBelongedToGroup(snapshot.receiverParticipantId)) {
        throw new Error('Persisted Settlement mutation Participant mismatch')
      }
      if (!currentGroup.hasFinancialHistory) throw new Error('Persisted Settlement mutation financial history mismatch')
      const local = value.settlements.find(item => item.id === snapshot.id)
      if (current.type === 'DeleteSettlement') {
        if (local) throw new Error('Persisted DeleteSettlement local state mismatch')
      } else {
        const newer = orderedMutations.some(item => item.createdOrder > current.createdOrder
          && (item.type === 'CreateSettlement' || item.type === 'UpdateSettlement' || item.type === 'DeleteSettlement')
          && item.payload.settlement.id === snapshot.id)
        if (!newer && JSON.stringify(local) !== JSON.stringify(snapshot)) throw new Error(`Persisted ${current.type} local state mismatch`)
      }
      continue
    }
    const participantId = current.payload.participantId
    const localParticipant = value.participants.find(item => item.id === participantId)
    if (localParticipant && localParticipant.groupId !== current.groupId) throw new Error('Persisted Participant mutation group mismatch')
    latestParticipantMutation.set(participantId, current)
  }

  for (const [participantId, latestMutation] of latestParticipantMutation) {
    const latest = latestMutation
    const local = value.participants.find(item => item.id === participantId)
    if (latest.type === 'DeleteParticipant') {
      if (local) throw new Error('Persisted DeleteParticipant local state mismatch')
      continue
    }
    if (!local) throw new Error('Persisted Participant mutation has no participant')
    if (latest.type === 'CreateGroup') {
      const initial = latest.payload.initialParticipant
      if (!initial || local.groupId !== latest.groupId || local.name !== initial.name
        || local.status !== 'active' || local.order !== 0) throw new Error('Persisted CreateGroup participant mismatch')
      continue
    }
    const expectedName = latest.payload.name
    const expectedActive = latest.type === 'AddParticipant' ? true : latest.payload.active
    if (local.groupId !== latest.groupId || local.name !== expectedName
      || (local.status === 'active') !== expectedActive || local.order !== latest.payload.order) {
      throw new Error(`Persisted ${latest.type} local state mismatch`)
    }
  }
  return value
}
