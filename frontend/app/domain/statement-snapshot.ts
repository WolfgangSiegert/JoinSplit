import { calculateParticipantBalances, formatSignedAmountMinor } from './balance'
import type { Group, Participant } from './create-group'
import { isCalendarDate, type Expense } from './expense'
import type { PendingMutation } from './pending-mutation'
import {
  proposeDeterministicSettlements,
  proposeMinimumTransferSettlements,
  type SettlementProposalTransfer,
} from './settlement-proposal'
import { formatSettlementAmountMinor, type Settlement } from './settlement'

export type StatementProposalStrategy = 'deterministic' | 'minimum-transfer'

export interface StatementSnapshotInput {
  readonly group: Group
  readonly participantId: string
  readonly participants: readonly Participant[]
  readonly expenses: readonly Expense[]
  readonly settlements: readonly Settlement[]
  readonly pendingMutations: readonly PendingMutation[]
  readonly proposalStrategy: StatementProposalStrategy
  readonly generatedAt: Date
}

export interface StatementSnapshot {
  readonly generatedAt: string
  readonly text: string
  readonly containsUnsyncedChanges: boolean
}

/** Materializes a self-contained plain-text view of one participant's current financial state. */
export function generateStatementSnapshot(input: StatementSnapshotInput): Readonly<StatementSnapshot> {
  validateGroup(input.group)
  validateInstant(input.generatedAt)
  if (input.proposalStrategy !== 'deterministic' && input.proposalStrategy !== 'minimum-transfer') {
    throw new Error('Statement Proposal strategy is invalid.')
  }

  const orderedParticipants = [...input.participants].sort((left, right) => left.order - right.order)
  validateGroupParticipants(input.group, orderedParticipants)
  validateDisplayFields(input.group, orderedParticipants, input.expenses, input.settlements)
  const participant = orderedParticipants.find(candidate => candidate.id === input.participantId)
  if (!participant) throw new Error('Statement Participant must belong to the supplied Group.')

  const balances = calculateParticipantBalances(
    input.group.id,
    orderedParticipants,
    input.expenses,
    input.settlements,
  )
  const balance = balances.find(candidate => candidate.participantId === participant.id)!
  const labels = createStatementParticipantLabels(orderedParticipants)
  const proposalParticipants = orderedParticipants.map(candidate => ({
    participantId: candidate.id,
    participantOrder: candidate.order,
    status: candidate.status,
    balanceAmountMinor: balances.find(balance => balance.participantId === candidate.id)!.balanceAmountMinor.toString(10),
  }))
  const proposal = input.proposalStrategy === 'minimum-transfer'
    ? proposeMinimumTransferSettlements(proposalParticipants)
    : proposeDeterministicSettlements(proposalParticipants)
  if (proposal.status === 'invalid') throw new Error(`Invalid Settlement Proposal state: ${proposal.error}.`)

  const generatedAt = input.generatedAt.toISOString()
  const containsUnsyncedChanges = input.pendingMutations.some(mutation => mutation.groupId === input.group.id)
  const lines: string[] = [
    'JoinSplit – Abrechnungsauszug',
    `Gruppe: ${plainLine(input.group.name)}${input.group.status === 'archived' ? ' (archiviert)' : ''}`,
    `Währung: ${input.group.currency}`,
    `Person: ${labels.get(participant.id)}${participant.status === 'inactive' ? ' (inaktiv)' : ''}`,
    `Erstellt: ${formatUtcInstant(input.generatedAt)}`,
  ]

  if (containsUnsyncedChanges) {
    lines.push('', 'Hinweis: Dieser lokale Gruppenstand enthält noch nicht synchronisierte Änderungen.')
  }

  lines.push(
    '',
    'Zusammenfassung',
    `Bezahlt: ${formatUnsigned(balance.paidAmountMinor)}`,
    `Eigene Anteile: ${formatUnsigned(balance.shareAmountMinor)}`,
    `Zahlungen gesendet: ${formatUnsigned(balance.sentSettlementAmountMinor)}`,
    `Zahlungen erhalten: ${formatUnsigned(balance.receivedSettlementAmountMinor)}`,
    `Offener Saldo: ${formatSignedAmountMinor(balance.balanceAmountMinor)}`,
    '',
    'Relevante Ausgaben',
  )

  const relevantExpenses = input.expenses
    .filter(expense => expense.payerParticipantId === participant.id || expense.shares.some(share => share.participantId === participant.id))
    .sort(compareDatedRecords('incurredOn'))
  if (relevantExpenses.length === 0) lines.push('Keine relevanten Ausgaben.')
  for (const expense of relevantExpenses) {
    const share = expense.shares.find(candidate => candidate.participantId === participant.id)?.amountMinor ?? 0
    lines.push(
      `- ${expense.incurredOn} · ${plainLine(expense.description)} · ${formatUnsigned(BigInt(expense.amountMinor))}`,
      `  Bezahlt von: ${labels.get(expense.payerParticipantId)} · Eigener Anteil: ${formatUnsigned(BigInt(share))}`,
    )
  }

  lines.push('', 'Relevante Zahlungen')
  const relevantSettlements = input.settlements
    .filter(settlement => settlement.senderParticipantId === participant.id || settlement.receiverParticipantId === participant.id)
    .sort(compareDatedRecords('occurredOn'))
  if (relevantSettlements.length === 0) lines.push('Keine relevanten Zahlungen.')
  for (const settlement of relevantSettlements) {
    lines.push(`- ${settlement.occurredOn} · ${labels.get(settlement.senderParticipantId)} → ${labels.get(settlement.receiverParticipantId)} · ${formatSettlementAmountMinor(settlement.amountMinor)}`)
  }

  lines.push('', `Vorgeschlagene Ausgleichszahlungen (${strategyLabel(input.proposalStrategy)})`)
  if (proposal.status === 'unavailable') {
    lines.push(`Nicht verfügbar: ${proposal.nonZeroParticipantCount} offene Salden; unterstützt werden höchstens ${proposal.limit}.`)
  } else {
    const relevantTransfers = proposal.transfers.filter(transfer => isRelevantTransfer(transfer, participant.id))
    if (relevantTransfers.length === 0) lines.push('Keine vorgeschlagenen Ausgleichszahlungen für diese Person.')
    for (const transfer of relevantTransfers) {
      lines.push(`- ${labels.get(transfer.senderParticipantId)} → ${labels.get(transfer.receiverParticipantId)} · ${formatSettlementAmountMinor(BigInt(transfer.amountMinor))}`)
    }
  }

  return Object.freeze({ generatedAt, text: lines.join('\n'), containsUnsyncedChanges })
}

function validateGroup(group: Group): void {
  if (!group.id) throw new Error('Statement Group ID is required.')
  if (group.currency !== 'EUR') throw new Error('Statement Group currency must be EUR.')
  if (group.status !== 'active' && group.status !== 'archived') throw new Error('Statement Group status is invalid.')
  if (typeof group.name !== 'string' || plainLine(group.name).length === 0) throw new Error('Statement Group name is invalid.')
}

function validateDisplayFields(
  group: Group,
  participants: readonly Participant[],
  expenses: readonly Expense[],
  settlements: readonly Settlement[],
): void {
  if (participants.some(participant => typeof participant.name !== 'string' || plainLine(participant.name).length === 0)) {
    throw new Error('Statement Participant names must be non-empty plain-text values.')
  }
  for (const expense of expenses) {
    if (expense.groupId === group.id && (typeof expense.description !== 'string' || plainLine(expense.description).length === 0)) {
      throw new Error('Statement Expense descriptions must be non-empty plain-text values.')
    }
    if (!isCalendarDate(expense.incurredOn)) throw new Error('Statement Expense date is invalid.')
    if (expense.splitMethod !== 'equal') throw new Error('Statement Expense split method is invalid.')
  }
  if (settlements.some(settlement => !isCalendarDate(settlement.occurredOn))) {
    throw new Error('Statement Settlement date is invalid.')
  }
}

function validateInstant(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('Statement generation instant is invalid.')
}

function validateGroupParticipants(group: Group, participants: readonly Participant[]): void {
  if (new Set(group.participantIds).size !== group.participantIds.length) throw new Error('Group Participant IDs must be unique.')
  const suppliedIds = new Set(participants.map(participant => participant.id))
  if (suppliedIds.size !== group.participantIds.length || group.participantIds.some(id => !suppliedIds.has(id))) {
    throw new Error('Supplied Participants must match the Group Participant IDs.')
  }
}

export function createStatementParticipantLabels(participants: readonly Participant[]): ReadonlyMap<string, string> {
  const orderedParticipants = [...participants].sort((left, right) => left.order - right.order)
  const normalizedNames = orderedParticipants.map(participant => plainLine(participant.name))
  const counts = new Map<string, number>()
  for (const name of normalizedNames) counts.set(name, (counts.get(name) ?? 0) + 1)
  return new Map(orderedParticipants.map((participant, index) => [
    participant.id,
    counts.get(normalizedNames[index]!)! > 1
      ? `${normalizedNames[index]} (Teilnehmer ${index + 1})`
      : normalizedNames[index]!,
  ]))
}

function plainLine(value: string): string {
  return value
    .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, '')
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function formatUtcInstant(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, '0')
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const year = value.getUTCFullYear()
  const hour = String(value.getUTCHours()).padStart(2, '0')
  const minute = String(value.getUTCMinutes()).padStart(2, '0')
  const second = String(value.getUTCSeconds()).padStart(2, '0')
  return `${day}.${month}.${year}, ${hour}:${minute}:${second} UTC`
}

function formatUnsigned(value: bigint): string {
  if (value < 0n) throw new Error('Statement subtotal cannot be negative.')
  return formatSettlementAmountMinor(value)
}

function compareDatedRecords<DateKey extends 'incurredOn' | 'occurredOn'>(dateKey: DateKey) {
  return <T extends Readonly<Record<DateKey | 'id', string>>>(left: T, right: T): number =>
    compareCodeUnits(right[dateKey], left[dateKey]) || compareCodeUnits(left.id, right.id)
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRelevantTransfer(transfer: SettlementProposalTransfer, participantId: string): boolean {
  return transfer.senderParticipantId === participantId || transfer.receiverParticipantId === participantId
}

function strategyLabel(strategy: StatementProposalStrategy): string {
  return strategy === 'minimum-transfer' ? 'Möglichst wenige Zahlungen' : 'Deterministisch'
}
