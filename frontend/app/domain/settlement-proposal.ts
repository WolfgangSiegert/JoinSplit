import { INT64_MAX, INT64_MIN } from './settlement'

const CANONICAL_SIGNED_MINOR = /^(?:0|-?[1-9][0-9]*)$/u
const ASCII_WHITESPACE_ONLY = /^[\u0009-\u000D\u0020]*$/u

export type SettlementProposalParticipantStatus = 'active' | 'inactive'

export interface SettlementProposalParticipant {
  readonly participantId: string
  readonly participantOrder: number
  readonly status: SettlementProposalParticipantStatus
  readonly balanceAmountMinor: string
}

export interface SettlementProposalTransfer {
  readonly senderParticipantId: string
  readonly receiverParticipantId: string
  readonly amountMinor: string
}

export type SettlementProposalValidationError =
  | 'invalid_participant'
  | 'invalid_participant_id'
  | 'duplicate_participant_id'
  | 'invalid_participant_order'
  | 'duplicate_participant_order'
  | 'invalid_participant_status'
  | 'invalid_balance_amount'
  | 'balance_out_of_supported_range'
  | 'balance_sum_not_zero'

export type DeterministicSettlementProposalResult =
  | { readonly status: 'success'; readonly transfers: readonly SettlementProposalTransfer[] }
  | InvalidSettlementProposalResult

interface InvalidSettlementProposalResult {
  readonly status: 'invalid'
  readonly error: SettlementProposalValidationError
}

interface ParsedParticipant {
  readonly participantId: string
  readonly participantOrder: number
  readonly status: SettlementProposalParticipantStatus
  balanceAmountMinor: bigint
}

interface NormalizedParticipant {
  readonly participantId: unknown
  readonly participantOrder: number
  readonly status: unknown
  readonly balanceAmountMinor: unknown
}

type ValidationResult =
  | { readonly status: 'valid'; readonly participants: ParsedParticipant[] }
  | InvalidSettlementProposalResult

/**
 * Builds the default stable two-pointer proposal without mutating its input.
 * Invalid domain input is returned as data so callers cannot mistake it for an
 * unavailable optional strategy.
 */
export function proposeDeterministicSettlements(
  input: readonly SettlementProposalParticipant[],
): DeterministicSettlementProposalResult {
  const validation = validateParticipants(input)
  if (validation.status === 'invalid') return validation

  const debtors = validation.participants
    .filter(participant => participant.balanceAmountMinor < 0n)
    .map(participant => ({ ...participant }))
  const creditors = validation.participants
    .filter(participant => participant.balanceAmountMinor > 0n)
    .map(participant => ({ ...participant }))
  const transfers: SettlementProposalTransfer[] = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!
    const creditor = creditors[creditorIndex]!
    const remainder = debtor.balanceAmountMinor + creditor.balanceAmountMinor

    if (remainder < 0n) {
      transfers.push(transfer(debtor, creditor, creditor.balanceAmountMinor))
      debtor.balanceAmountMinor = remainder
      creditorIndex += 1
    } else if (remainder === 0n) {
      transfers.push(transfer(debtor, creditor, creditor.balanceAmountMinor))
      debtorIndex += 1
      creditorIndex += 1
    } else {
      // A positive remainder proves that the debt is not INT64_MIN, so this
      // negation is representable in the shared signed-64-bit domain.
      transfers.push(transfer(debtor, creditor, -debtor.balanceAmountMinor))
      creditor.balanceAmountMinor = remainder
      debtorIndex += 1
    }
  }

  if (debtorIndex < debtors.length || creditorIndex < creditors.length) {
    return invalid('balance_sum_not_zero')
  }

  return { status: 'success', transfers }
}

function validateParticipants(input: readonly SettlementProposalParticipant[]): ValidationResult {
  for (const participant of input) {
    const value: unknown = participant
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return invalid('invalid_participant')
    }
  }

  const normalized: NormalizedParticipant[] = []
  for (const participant of input) {
    const record = participant as unknown as Record<string, unknown>
    const participantOrder = record.participantOrder
    if (typeof participantOrder !== 'number' || !Number.isSafeInteger(participantOrder) || participantOrder < 0) {
      return invalid('invalid_participant_order')
    }
    normalized.push({
      participantId: record.participantId,
      participantOrder,
      status: record.status,
      balanceAmountMinor: record.balanceAmountMinor,
    })
  }

  normalized.sort((left, right) => left.participantOrder - right.participantOrder)
  const participantIds = new Set<string>()
  const participantOrders = new Set<number>()
  const participants: ParsedParticipant[] = []

  for (const participant of normalized) {
    if (typeof participant.participantId !== 'string' || ASCII_WHITESPACE_ONLY.test(participant.participantId)) {
      return invalid('invalid_participant_id')
    }
  }

  for (const participant of normalized) {
    const participantId = participant.participantId as string
    if (participantIds.has(participantId)) return invalid('duplicate_participant_id')
    participantIds.add(participantId)
  }

  for (const participant of normalized) {
    if (participantOrders.has(participant.participantOrder)) return invalid('duplicate_participant_order')
    participantOrders.add(participant.participantOrder)
  }

  for (const participant of normalized) {
    if (participant.status !== 'active' && participant.status !== 'inactive') {
      return invalid('invalid_participant_status')
    }
  }

  for (const participant of normalized) {
    if (typeof participant.balanceAmountMinor !== 'string' || !CANONICAL_SIGNED_MINOR.test(participant.balanceAmountMinor)) {
      return invalid('invalid_balance_amount')
    }

    const balanceAmountMinor = BigInt(participant.balanceAmountMinor)
    if (balanceAmountMinor < INT64_MIN || balanceAmountMinor > INT64_MAX) {
      return invalid('balance_out_of_supported_range')
    }

    participants.push({
      participantId: participant.participantId as string,
      participantOrder: participant.participantOrder,
      status: participant.status as SettlementProposalParticipantStatus,
      balanceAmountMinor,
    })
  }

  if (!balancesCancelExactly(participants)) return invalid('balance_sum_not_zero')

  return { status: 'valid', participants }
}

function balancesCancelExactly(participants: readonly ParsedParticipant[]): boolean {
  const debts = participants.filter(participant => participant.balanceAmountMinor < 0n).map(participant => participant.balanceAmountMinor)
  const credits = participants.filter(participant => participant.balanceAmountMinor > 0n).map(participant => participant.balanceAmountMinor)
  let debtIndex = 0
  let creditIndex = 0

  while (debtIndex < debts.length && creditIndex < credits.length) {
    const remainder = debts[debtIndex]! + credits[creditIndex]!
    if (remainder < 0n) {
      debts[debtIndex] = remainder
      creditIndex += 1
    } else if (remainder > 0n) {
      credits[creditIndex] = remainder
      debtIndex += 1
    } else {
      debtIndex += 1
      creditIndex += 1
    }
  }

  return debtIndex === debts.length && creditIndex === credits.length
}

function transfer(
  debtor: ParsedParticipant,
  creditor: ParsedParticipant,
  amountMinor: bigint,
): SettlementProposalTransfer {
  return {
    senderParticipantId: debtor.participantId,
    receiverParticipantId: creditor.participantId,
    amountMinor: amountMinor.toString(10),
  }
}

function invalid(error: SettlementProposalValidationError): InvalidSettlementProposalResult {
  return { status: 'invalid', error }
}
