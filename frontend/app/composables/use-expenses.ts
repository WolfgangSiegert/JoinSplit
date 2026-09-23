import { prepareExpenseDelete, prepareExpenseSave, type Expense, type ExpenseDraft } from '../domain/expense'
import { persistExpenseDelete, persistExpenseSave } from '../persistence/database'
import { useAccessIdentityStore } from '../stores/access-identity'
import { useGroupsStore } from '../stores/groups'
import { serializeGroupLocalWrite } from './group-local-write'

interface ExpenseDependencies {
  persistDelete: typeof persistExpenseDelete
  persistSave: typeof persistExpenseSave
}

export function useExpenses(dependencies: ExpenseDependencies = {
  persistDelete: persistExpenseDelete,
  persistSave: persistExpenseSave,
}) {
  const groupsStore = useGroupsStore(); const identityStore = useAccessIdentityStore()
  async function save(groupId: string, draft: ExpenseDraft, existing?: Expense) {
    return serializeGroupLocalWrite(groupsStore, groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findGroup(groupId)
      const actorId = identityStore.accessIdentityId
      if (!group || group.status !== 'active' || !actorId) throw new Error('Active owned group required')
      const currentExpense = existing && groupsStore.expenses.find(item => item.id === existing.id)
      if (existing && !currentExpense) throw new Error('Expense required')
      const prepared = prepareExpenseSave({ group, participants: groupsStore.participantsForGroup(groupId), pendingMutations: groupsStore.pendingMutations, actorId, draft, existing: currentExpense, createdOrder })
      if (!prepared.ok) return prepared
      await dependencies.persistSave(prepared.group, prepared.expense, prepared.mutation)
      groupsStore.commitExpenseSave(prepared.group, prepared.expense, prepared.mutation)
      return prepared
    })
  }
  async function remove(expense: Expense) {
    return serializeGroupLocalWrite(groupsStore, expense.groupId, groupsStore.pendingMutations, async (createdOrder) => {
      const group = groupsStore.findGroup(expense.groupId)
      const currentExpense = groupsStore.expenses.find(item => item.id === expense.id)
      if (!group || group.status !== 'active' || !currentExpense) throw new Error('Active group and expense required')
      const mutation = prepareExpenseDelete(currentExpense, groupsStore.pendingMutations, undefined, createdOrder)
      await dependencies.persistDelete(currentExpense, mutation)
      groupsStore.commitExpenseDelete(currentExpense.id, mutation)
    })
  }
  return { save, remove }
}
