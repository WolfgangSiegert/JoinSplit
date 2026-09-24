import type { Participant } from './create-group'
import type { Expense } from './expense'

export interface ParticipantBalance {
  readonly participantId: string
  readonly paidAmountMinor: bigint
  readonly shareAmountMinor: bigint
  readonly balanceAmountMinor: bigint
}

interface MutableBalance {
  paidAmountMinor: bigint
  shareAmountMinor: bigint
}

function assertSafeInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer greater than or equal to ${minimum}.`)
  }
}

export function calculateParticipantBalances(
  groupId: string,
  participants: readonly Participant[],
  expenses: readonly Expense[],
): ParticipantBalance[] {
  if (!groupId) throw new Error('Group ID is required.')

  const participantIds = new Set<string>()
  const participantOrders = new Set<number>()
  const balances = new Map<string, MutableBalance>()

  for (const participant of participants) {
    if (!participant.id || participantIds.has(participant.id)) {
      throw new Error('Participant IDs must be present and unique.')
    }
    if (participant.groupId !== groupId) {
      throw new Error('Every Participant must belong to the requested Group.')
    }
    assertSafeInteger(participant.order, 'Participant order', 0)
    if (participantOrders.has(participant.order)) {
      throw new Error('Participant order values must be unique.')
    }

    participantIds.add(participant.id)
    participantOrders.add(participant.order)
    balances.set(participant.id, { paidAmountMinor: 0n, shareAmountMinor: 0n })
  }

  const expenseIds = new Set<string>()
  for (const expense of expenses) {
    if (!expense.id || expenseIds.has(expense.id)) {
      throw new Error('Expense IDs must be present and unique.')
    }
    if (expense.groupId !== groupId) {
      throw new Error('Every Expense must belong to the requested Group.')
    }
    assertSafeInteger(expense.amountMinor, 'Expense amount', 1)

    const payerBalance = balances.get(expense.payerParticipantId)
    if (!payerBalance) throw new Error('Expense payer must reference a supplied Participant.')
    if (!expense.shares.length) throw new Error('Every Expense must contain at least one Share.')

    const shareParticipantIds = new Set<string>()
    let shareSum = 0n
    for (const share of expense.shares) {
      if (!share.participantId || shareParticipantIds.has(share.participantId)) {
        throw new Error('Expense Share Participant IDs must be present and unique per Expense.')
      }
      const participantBalance = balances.get(share.participantId)
      if (!participantBalance) {
        throw new Error('Every Expense Share must reference a supplied Participant.')
      }
      assertSafeInteger(share.amountMinor, 'Expense Share amount', 0)

      const amountMinor = BigInt(share.amountMinor)
      participantBalance.shareAmountMinor += amountMinor
      shareSum += amountMinor
      shareParticipantIds.add(share.participantId)
    }

    const expenseAmountMinor = BigInt(expense.amountMinor)
    if (shareSum !== expenseAmountMinor) {
      throw new Error('Expense Share amounts must sum exactly to the Expense amount.')
    }
    payerBalance.paidAmountMinor += expenseAmountMinor
    expenseIds.add(expense.id)
  }

  const result = [...participants]
    .sort((left, right) => left.order - right.order)
    .map((participant): ParticipantBalance => {
      const balance = balances.get(participant.id)!
      return {
        participantId: participant.id,
        paidAmountMinor: balance.paidAmountMinor,
        shareAmountMinor: balance.shareAmountMinor,
        balanceAmountMinor: balance.paidAmountMinor - balance.shareAmountMinor,
      }
    })

  if (result.reduce((sum, balance) => sum + balance.balanceAmountMinor, 0n) !== 0n) {
    throw new Error('Participant Balances must sum exactly to zero.')
  }

  return result
}

export function formatSignedAmountMinor(amountMinor: bigint): string {
  const sign = amountMinor > 0n ? '+' : amountMinor < 0n ? '−' : ''
  const absoluteAmountMinor = amountMinor < 0n ? -amountMinor : amountMinor
  const whole = absoluteAmountMinor / 100n
  const fraction = String(absoluteAmountMinor % 100n).padStart(2, '0')

  return `${sign}${whole},${fraction} €`
}
