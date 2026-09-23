import { normalizeName, type Group, type Participant } from './create-group'
import { freezePendingMutation, nextCreatedOrder, type PendingCreateExpense, type PendingDeleteExpense, type PendingMutation, type PendingUpdateExpense } from './pending-mutation'

export const MAX_AMOUNT_MINOR = Number.MAX_SAFE_INTEGER
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u
const MONEY = /^(0|[1-9]\d*)(?:([,.])(\d{1,2}))?$/u

export interface ExpenseShare { readonly participantId: string; readonly amountMinor: number }
export interface Expense {
  readonly id: string
  readonly groupId: string
  readonly description: string
  readonly amountMinor: number
  readonly incurredOn: string
  readonly payerParticipantId: string
  readonly creatorAccessIdentityId: string
  readonly splitMethod: 'equal'
  readonly shares: readonly ExpenseShare[]
}

export interface ExpenseDraft {
  description: string
  amount: string
  incurredOn: string
  payerParticipantId: string
  participantIds: string[]
}

export interface ExpenseErrors {
  description?: string
  amount?: string
  incurredOn?: string
  payerParticipantId?: string
  participantIds?: string
}

export function parseAmountMinor(value: string): number | null {
  const match = MONEY.exec(value)
  if (!match) return null
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const minor = BigInt(match[1]!) * 100n + BigInt(fraction || '0')
  if (minor <= 0n || minor > BigInt(MAX_AMOUNT_MINOR)) return null
  return Number(minor)
}

export function formatAmountMinor(value: number): string {
  const whole = Math.floor(value / 100)
  const fraction = String(value % 100).padStart(2, '0')
  return `${whole},${fraction} €`
}

export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value)
  if (!match) return false
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function localToday(now: Date = new Date()): string {
  const year = now.getFullYear(); const month = String(now.getMonth() + 1).padStart(2, '0'); const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calculateEqualShares(amountMinor: number, selectedParticipantIds: readonly string[], participants: readonly Participant[]): ExpenseShare[] {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('Positive safe integer amount required')
  const selected = new Set(selectedParticipantIds)
  const ordered = participants.filter(participant => selected.has(participant.id)).sort((a, b) => a.order - b.order)
  if (!ordered.length || ordered.length !== selected.size) throw new Error('Known unique Participants required')
  const base = Math.floor(amountMinor / ordered.length); const remainder = amountMinor % ordered.length
  return ordered.map((participant, index) => ({ participantId: participant.id, amountMinor: base + (index < remainder ? 1 : 0) }))
}

export function validateExpenseDraft(draft: ExpenseDraft, participants: readonly Participant[], existing?: Expense): { errors: ExpenseErrors; normalizedDescription: string; amountMinor: number | null } {
  const errors: ExpenseErrors = {}; const normalizedDescription = normalizeName(draft.description); const length = Array.from(normalizedDescription).length
  if (!length) errors.description = 'Beschreibung ist erforderlich.'
  else if (length > 200) errors.description = 'Beschreibung darf höchstens 200 Zeichen lang sein.'
  const amountMinor = parseAmountMinor(draft.amount)
  if (amountMinor === null) errors.amount = 'Betrag als positive Zahl mit höchstens zwei Nachkommastellen eingeben.'
  if (!isCalendarDate(draft.incurredOn)) errors.incurredOn = 'Gültiges Datum im Format JJJJ-MM-TT eingeben.'
  const byId = new Map(participants.map(participant => [participant.id, participant]))
  const existingIds = new Set(existing?.shares.map(share => share.participantId) ?? [])
  const existingPayer = existing?.payerParticipantId
  const payer = byId.get(draft.payerParticipantId)
  if (!payer || (payer.status !== 'active' && payer.id !== existingPayer)) errors.payerParticipantId = 'Zahlende Person auswählen.'
  const selected = [...new Set(draft.participantIds)]
  if (!selected.length) errors.participantIds = 'Mindestens eine Person für die Aufteilung auswählen.'
  else if (selected.some(id => { const participant = byId.get(id); return !participant || (participant.status !== 'active' && !existingIds.has(id)) })) errors.participantIds = 'Die Auswahl enthält eine nicht verfügbare Person.'
  return { errors, normalizedDescription, amountMinor }
}

function preparedExpense(expense: Expense, type: 'CreateExpense' | 'UpdateExpense', mutations: readonly PendingMutation[], generateId: () => string, createdOrder = nextCreatedOrder(mutations)) {
  const base = { id: generateId(), type, groupId: expense.groupId, createdOrder, payload: { expense } }
  return freezePendingMutation(base as PendingCreateExpense | PendingUpdateExpense)
}

export function prepareExpenseSave(input: { group: Group; participants: readonly Participant[]; pendingMutations: readonly PendingMutation[]; actorId: string; draft: ExpenseDraft; existing?: Expense; generateId?: () => string; createdOrder?: number }): { ok: true; expense: Expense; group: Group; mutation: Readonly<PendingCreateExpense | PendingUpdateExpense> } | { ok: false; errors: ExpenseErrors } {
  const validation = validateExpenseDraft(input.draft, input.participants, input.existing)
  if (Object.keys(validation.errors).length || validation.amountMinor === null) return { ok: false, errors: validation.errors }
  if (input.group.status !== 'active') throw new Error('Active group required')
  const generateId = input.generateId ?? (() => crypto.randomUUID())
  const id = input.existing?.id ?? generateId()
  const shares = calculateEqualShares(validation.amountMinor, input.draft.participantIds, input.participants)
  const expense: Expense = { id, groupId: input.group.id, description: validation.normalizedDescription, amountMinor: validation.amountMinor, incurredOn: input.draft.incurredOn, payerParticipantId: input.draft.payerParticipantId, creatorAccessIdentityId: input.actorId, splitMethod: 'equal', shares }
  const type = input.existing ? 'UpdateExpense' : 'CreateExpense'
  return {
    ok: true,
    expense,
    group: { ...input.group, hasFinancialHistory: true, participantIds: [...input.group.participantIds] },
    mutation: preparedExpense(expense, type, input.pendingMutations, generateId, input.createdOrder),
  }
}

export function prepareExpenseDelete(expense: Expense, mutations: readonly PendingMutation[], generateId: () => string = () => crypto.randomUUID(), createdOrder: number = nextCreatedOrder(mutations)): Readonly<PendingDeleteExpense> {
  const snapshot: Expense = {
    ...expense,
    shares: expense.shares.map(share => ({ ...share })),
  }
  return freezePendingMutation({ id: generateId(), type: 'DeleteExpense', groupId: expense.groupId, createdOrder, payload: { expense: snapshot } })
}

export function participantHasFinancialReferences(participantId: string, expenses: readonly Expense[]): boolean {
  return expenses.some(expense => expense.payerParticipantId === participantId || expense.shares.some(share => share.participantId === participantId))
}
