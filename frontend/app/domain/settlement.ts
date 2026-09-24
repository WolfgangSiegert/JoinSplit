import type { Group, Participant } from './create-group'
import { isCalendarDate } from './expense'
import {
  freezePendingMutation,
  nextCreatedOrder,
  type PendingCreateSettlement,
  type PendingDeleteSettlement,
  type PendingMutation,
  type PendingUpdateSettlement,
} from './pending-mutation'

export const INT64_MIN = -9223372036854775808n
export const INT64_MAX = 9223372036854775807n
const POSITIVE_MINOR = /^[1-9][0-9]{0,18}$/u
const EURO_AMOUNT = /^(0|[1-9][0-9]*)(?:([,.])([0-9]{1,2}))?$/u

export interface Settlement {
  readonly id: string
  readonly groupId: string
  readonly senderParticipantId: string
  readonly receiverParticipantId: string
  readonly amountMinor: bigint
  readonly occurredOn: string
  readonly creatorAccessIdentityId: string
}

export type DurableSettlementSnapshot = Omit<Settlement, 'amountMinor'> & {
  readonly amountMinor: string
}

export interface SettlementDraft {
  senderParticipantId: string
  receiverParticipantId: string
  amount: string
  occurredOn: string
}

export interface SettlementErrors {
  senderParticipantId?: string
  receiverParticipantId?: string
  amount?: string
  occurredOn?: string
  balance?: string
}

export type SettlementAssessment =
  | { readonly decision: 'accept'; readonly confirmationReasons: readonly [] }
  | { readonly decision: 'confirm'; readonly confirmationReasons: readonly ('wrong_direction' | 'exceeds_open_amount')[] }
  | { readonly decision: 'reject'; readonly rejectionReason: 'inactive_participant_payment_must_reduce_open_balance' | 'inactive_participant_payment_exceeds_open_amount' | 'financial_state_overflow' }

export function isCanonicalPositiveMinor(value: unknown): value is string {
  if (typeof value !== 'string' || !POSITIVE_MINOR.test(value)) return false
  try { return BigInt(value) <= INT64_MAX } catch { return false }
}

export function serializeSettlement(settlement: Settlement): DurableSettlementSnapshot {
  if (settlement.amountMinor <= 0n || settlement.amountMinor > INT64_MAX) throw new Error('Settlement amount is outside the supported range.')
  return { ...settlement, amountMinor: settlement.amountMinor.toString(10) }
}

export function restoreSettlement(snapshot: DurableSettlementSnapshot): Settlement {
  if (!isCanonicalPositiveMinor(snapshot.amountMinor)) throw new Error('Invalid durable Settlement amount.')
  return { ...snapshot, amountMinor: BigInt(snapshot.amountMinor) }
}

export function parseSettlementAmountMinor(value: string): bigint | null {
  const match = EURO_AMOUNT.exec(value)
  if (!match) return null
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const amountMinor = BigInt(match[1]!) * 100n + BigInt(fraction || '0')
  return amountMinor > 0n && amountMinor <= INT64_MAX ? amountMinor : null
}

export function formatSettlementAmountMinor(value: bigint): string {
  if (value < 0n) throw new Error('A Settlement amount cannot be negative.')
  return `${value / 100n},${String(value % 100n).padStart(2, '0')}\u00a0€`
}

export function settlementAmountInput(value: bigint): string {
  return `${value / 100n},${String(value % 100n).padStart(2, '0')}`
}

function checkedResult(value: bigint): boolean { return value >= INT64_MIN && value <= INT64_MAX }

export function applySettlementToBalances(
  balances: ReadonlyMap<string, bigint>,
  settlement: Readonly<Pick<Settlement, 'senderParticipantId' | 'receiverParticipantId' | 'amountMinor'>>,
  direction: 'apply' | 'reverse' = 'apply',
): Map<string, bigint> {
  if (settlement.senderParticipantId === settlement.receiverParticipantId) throw new Error('Settlement sender and receiver must be different.')
  if (settlement.amountMinor <= 0n || settlement.amountMinor > INT64_MAX) throw new Error('Settlement amount is outside the supported range.')
  const senderBalance = balances.get(settlement.senderParticipantId)
  const receiverBalance = balances.get(settlement.receiverParticipantId)
  if (senderBalance === undefined || receiverBalance === undefined) throw new Error('Settlement Participants require balances.')
  if (!checkedResult(senderBalance) || !checkedResult(receiverBalance)) throw new RangeError('Settlement input Balance is outside the supported financial-state range.')
  const factor = direction === 'apply' ? 1n : -1n
  const senderAfter = senderBalance + factor * settlement.amountMinor
  const receiverAfter = receiverBalance - factor * settlement.amountMinor
  if (!checkedResult(senderAfter) || !checkedResult(receiverAfter)) throw new RangeError('Settlement would overflow the supported financial-state range.')
  const result = new Map(balances)
  result.set(settlement.senderParticipantId, senderAfter)
  result.set(settlement.receiverParticipantId, receiverAfter)
  return result
}

export function assessSettlement(
  sender: Participant,
  receiver: Participant,
  amountMinor: bigint,
  balancesBeforeCandidate: ReadonlyMap<string, bigint>,
): SettlementAssessment {
  const senderBalance = balancesBeforeCandidate.get(sender.id)
  const receiverBalance = balancesBeforeCandidate.get(receiver.id)
  if (senderBalance === undefined || receiverBalance === undefined) throw new Error('Settlement Participants require balances.')
  try {
    applySettlementToBalances(balancesBeforeCandidate, { senderParticipantId: sender.id, receiverParticipantId: receiver.id, amountMinor })
  } catch (error) {
    if (error instanceof RangeError) return { decision: 'reject', rejectionReason: 'financial_state_overflow' }
    throw error
  }
  const correctDirection = senderBalance < 0n && receiverBalance > 0n
  const withinOpenAmount = senderBalance <= -amountMinor && amountMinor <= receiverBalance
  if (sender.status === 'inactive' || receiver.status === 'inactive') {
    if (!correctDirection) return { decision: 'reject', rejectionReason: 'inactive_participant_payment_must_reduce_open_balance' }
    if (!withinOpenAmount) return { decision: 'reject', rejectionReason: 'inactive_participant_payment_exceeds_open_amount' }
    return { decision: 'accept', confirmationReasons: [] }
  }
  const reasons: Array<'wrong_direction' | 'exceeds_open_amount'> = []
  if (!correctDirection) reasons.push('wrong_direction')
  else if (!withinOpenAmount) reasons.push('exceeds_open_amount')
  return reasons.length ? { decision: 'confirm', confirmationReasons: reasons } : { decision: 'accept', confirmationReasons: [] }
}

export function validateSettlementDraft(
  draft: SettlementDraft,
  participants: readonly Participant[],
  balancesBeforeCandidate: ReadonlyMap<string, bigint>,
): { readonly errors: SettlementErrors; readonly amountMinor: bigint | null; readonly assessment: SettlementAssessment | null } {
  const errors: SettlementErrors = {}
  const byId = new Map(participants.map(participant => [participant.id, participant]))
  const sender = byId.get(draft.senderParticipantId)
  const receiver = byId.get(draft.receiverParticipantId)
  if (!sender) errors.senderParticipantId = 'Zahlende Person auswählen.'
  if (!receiver) errors.receiverParticipantId = 'Empfangende Person auswählen.'
  if (sender && receiver && sender.id === receiver.id) errors.receiverParticipantId = 'Sender und Empfänger müssen verschieden sein.'
  const amountMinor = parseSettlementAmountMinor(draft.amount)
  if (amountMinor === null) errors.amount = 'Betrag als positive Zahl mit höchstens zwei Nachkommastellen eingeben.'
  if (!isCalendarDate(draft.occurredOn)) errors.occurredOn = 'Gültiges Datum im Format JJJJ-MM-TT eingeben.'
  const assessment = sender && receiver && sender.id !== receiver.id && amountMinor !== null
    ? assessSettlement(sender, receiver, amountMinor, balancesBeforeCandidate)
    : null
  if (assessment?.decision === 'reject') {
    errors.balance = assessment.rejectionReason === 'financial_state_overflow'
      ? 'Die Zahlung würde den unterstützten Zahlenbereich überschreiten.'
      : 'Mit inaktiven Personen darf eine Zahlung nur einen offenen Saldo in korrekter Richtung reduzieren.'
  }
  return { errors, amountMinor, assessment }
}

function settlementMutation(
  settlement: Settlement,
  type: 'CreateSettlement' | 'UpdateSettlement',
  mutations: readonly PendingMutation[],
  generateId: () => string,
  createdOrder = nextCreatedOrder(mutations),
): Readonly<PendingCreateSettlement | PendingUpdateSettlement> {
  return freezePendingMutation({ id: generateId(), type, groupId: settlement.groupId, createdOrder, payload: { settlement: serializeSettlement(settlement) } })
}

export function prepareSettlementSave(input: {
  readonly group: Group
  readonly participants: readonly Participant[]
  readonly pendingMutations: readonly PendingMutation[]
  readonly balancesBeforeCandidate: ReadonlyMap<string, bigint>
  readonly actorId: string
  readonly draft: SettlementDraft
  readonly existing?: Settlement
  readonly confirmationAccepted?: boolean
  readonly generateId?: () => string
  readonly createdOrder?: number
}): { readonly ok: true; readonly settlement: Settlement; readonly group: Group; readonly mutation: Readonly<PendingCreateSettlement | PendingUpdateSettlement> }
  | { readonly ok: false; readonly errors: SettlementErrors; readonly confirmationReasons?: readonly ('wrong_direction' | 'exceeds_open_amount')[] } {
  if (input.group.status !== 'active') throw new Error('Active group required')
  const validation = validateSettlementDraft(input.draft, input.participants, input.balancesBeforeCandidate)
  if (Object.keys(validation.errors).length || validation.amountMinor === null) return { ok: false, errors: validation.errors }
  if (validation.assessment?.decision === 'confirm' && !input.confirmationAccepted) {
    return { ok: false, errors: {}, confirmationReasons: validation.assessment.confirmationReasons }
  }
  const generateId = input.generateId ?? (() => crypto.randomUUID())
  const settlement: Settlement = {
    id: input.existing?.id ?? generateId(), groupId: input.group.id,
    senderParticipantId: input.draft.senderParticipantId,
    receiverParticipantId: input.draft.receiverParticipantId,
    amountMinor: validation.amountMinor, occurredOn: input.draft.occurredOn,
    creatorAccessIdentityId: input.existing?.creatorAccessIdentityId ?? input.actorId,
  }
  return {
    ok: true,
    settlement,
    group: { ...input.group, hasFinancialHistory: true, participantIds: [...input.group.participantIds] },
    mutation: settlementMutation(settlement, input.existing ? 'UpdateSettlement' : 'CreateSettlement', input.pendingMutations, generateId, input.createdOrder),
  }
}

export function prepareSettlementDelete(
  settlement: Settlement,
  mutations: readonly PendingMutation[],
  generateId: () => string = () => crypto.randomUUID(),
  createdOrder = nextCreatedOrder(mutations),
): Readonly<PendingDeleteSettlement> {
  return freezePendingMutation({ id: generateId(), type: 'DeleteSettlement', groupId: settlement.groupId, createdOrder, payload: { settlement: serializeSettlement(settlement) } })
}

export function participantHasSettlementReferences(participantId: string, settlements: readonly Settlement[]): boolean {
  return settlements.some(settlement => settlement.senderParticipantId === participantId || settlement.receiverParticipantId === participantId)
}
