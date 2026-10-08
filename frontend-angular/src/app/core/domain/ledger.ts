import { Expense, ExpenseShare, Participant, ParticipantBalance, Settlement } from './models';

const MONEY = /^(0|[1-9]\d*)(?:([,.])(\d{1,2}))?$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const EDGE_WHITESPACE =
  /^[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/gu;

export function normalizeName(value: string): string {
  return value.replace(EDGE_WHITESPACE, '');
}
export function validName(value: string, max = 100): boolean {
  const length = Array.from(normalizeName(value)).length;
  return length > 0 && length <= max;
}
export function parseAmountMinor(value: string): number | null {
  const match = MONEY.exec(value);
  if (!match) return null;
  const minor = BigInt(match[1]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  return minor > 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}
export function parseSettlementAmountMinor(value: string): bigint | null {
  const match = MONEY.exec(value);
  if (!match) return null;
  const minor = BigInt(match[1]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  return minor > 0n && minor <= 9223372036854775807n ? minor : null;
}
export function formatAmountMinor(value: bigint | number, signed = false): string {
  const minor = typeof value === 'number' ? BigInt(value) : value;
  const sign = minor < 0n ? '−' : signed && minor > 0n ? '+' : '';
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n},${String(absolute % 100n).padStart(2, '0')} €`;
}
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function calculateEqualShares(
  amountMinor: number,
  participantIds: readonly string[],
  participants: readonly Participant[],
): ExpenseShare[] {
  const selected = new Set(participantIds);
  const ordered = participants
    .filter((item) => selected.has(item.id))
    .sort((a, b) => a.order - b.order);
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    ordered.length === 0 ||
    ordered.length !== selected.size
  ) {
    throw new Error('Eine gültige positive Summe und bekannte Teilnehmer sind erforderlich.');
  }
  const base = Math.floor(amountMinor / ordered.length);
  const remainder = amountMinor % ordered.length;
  return ordered.map((participant, index) => ({
    participantId: participant.id,
    amountMinor: base + (index < remainder ? 1 : 0),
  }));
}
export function calculateBalances(
  groupId: string,
  participants: readonly Participant[],
  expenses: readonly Expense[],
  settlements: readonly Settlement[],
): ParticipantBalance[] {
  const values = new Map(
    participants.map((item) => [item.id, { paid: 0n, share: 0n, sent: 0n, received: 0n }]),
  );
  for (const expense of expenses.filter((item) => item.groupId === groupId)) {
    values.get(expense.payerParticipantId)!.paid += BigInt(expense.amountMinor);
    for (const share of expense.shares)
      values.get(share.participantId)!.share += BigInt(share.amountMinor);
  }
  for (const settlement of settlements.filter((item) => item.groupId === groupId)) {
    values.get(settlement.senderParticipantId)!.sent += settlement.amountMinor;
    values.get(settlement.receiverParticipantId)!.received += settlement.amountMinor;
  }
  return [...participants]
    .sort((a, b) => a.order - b.order)
    .map((participant) => {
      const value = values.get(participant.id)!;
      return {
        participantId: participant.id,
        paidAmountMinor: value.paid,
        shareAmountMinor: value.share,
        sentSettlementAmountMinor: value.sent,
        receivedSettlementAmountMinor: value.received,
        balanceAmountMinor: value.paid - value.share + value.sent - value.received,
      };
    });
}

export type SettlementAssessment =
  | { readonly decision: 'accept'; readonly confirmationReasons: readonly [] }
  | {
      readonly decision: 'confirm';
      readonly confirmationReasons: readonly ('wrong_direction' | 'exceeds_open_amount')[];
    }
  | {
      readonly decision: 'reject';
      readonly rejectionReason:
        | 'inactive_participant_payment_must_reduce_open_balance'
        | 'inactive_participant_payment_exceeds_open_amount';
    };

export function assessSettlement(
  sender: Participant,
  receiver: Participant,
  amountMinor: bigint,
  balances: ReadonlyMap<string, bigint>,
): SettlementAssessment {
  const senderBalance = balances.get(sender.id);
  const receiverBalance = balances.get(receiver.id);
  if (senderBalance === undefined || receiverBalance === undefined)
    throw new Error('Für beide Teilnehmer muss ein Saldo vorhanden sein.');
  const correctDirection = senderBalance < 0n && receiverBalance > 0n;
  const withinOpenAmount = senderBalance <= -amountMinor && amountMinor <= receiverBalance;
  if (sender.status === 'inactive' || receiver.status === 'inactive') {
    if (!correctDirection)
      return {
        decision: 'reject',
        rejectionReason: 'inactive_participant_payment_must_reduce_open_balance',
      };
    if (!withinOpenAmount)
      return {
        decision: 'reject',
        rejectionReason: 'inactive_participant_payment_exceeds_open_amount',
      };
    return { decision: 'accept', confirmationReasons: [] };
  }
  const confirmationReasons: ('wrong_direction' | 'exceeds_open_amount')[] = [];
  if (!correctDirection) confirmationReasons.push('wrong_direction');
  else if (!withinOpenAmount) confirmationReasons.push('exceeds_open_amount');
  return confirmationReasons.length
    ? { decision: 'confirm', confirmationReasons }
    : { decision: 'accept', confirmationReasons: [] };
}

export function participantHasFinancialReferences(
  participantId: string,
  expenses: readonly Expense[],
  settlements: readonly Settlement[],
): boolean {
  return (
    expenses.some(
      (expense) =>
        expense.payerParticipantId === participantId ||
        expense.shares.some((share) => share.participantId === participantId),
    ) ||
    settlements.some(
      (settlement) =>
        settlement.senderParticipantId === participantId ||
        settlement.receiverParticipantId === participantId,
    )
  );
}
