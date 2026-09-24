<script setup lang="ts">
import { calculateParticipantBalances, formatSignedAmountMinor } from '../../../../domain/balance'

const route = useRoute()
const groupsStore = useGroupsStore()
const groupId = computed(() => String(route.params.id))
const participantId = computed(() => String(route.params.participantId))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const participant = computed(() => participants.value.find(item => item.id === participantId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const settlements = computed(() => groupsStore.settlementsForGroup(groupId.value))
const balance = computed(() => calculateParticipantBalances(groupId.value, participants.value, expenses.value, settlements.value)
  .find(item => item.participantId === participantId.value))
const relevantExpenses = computed(() => expenses.value.filter(expense =>
  expense.payerParticipantId === participantId.value
  || expense.shares.some(share => share.participantId === participantId.value),
))
const relevantSettlements = computed(() => settlements.value.filter(settlement => settlement.senderParticipantId === participantId.value || settlement.receiverParticipantId === participantId.value))
const participantNames = computed(() => new Map(participants.value.map(item => [item.id, item.name])))

function shareAmount(expenseId: string): bigint {
  const expense = relevantExpenses.value.find(item => item.id === expenseId)
  return BigInt(expense?.shares.find(share => share.participantId === participantId.value)?.amountMinor ?? 0)
}

function paidAmount(payerParticipantId: string, amountMinor: number): bigint {
  return payerParticipantId === participantId.value ? BigInt(amountMinor) : 0n
}

function balanceText(amountMinor: bigint): string {
  if (amountMinor > 0n) return 'Diese Person soll Geld erhalten.'
  if (amountMinor < 0n) return 'Diese Person soll Geld zahlen.'
  return 'Diese Person ist ausgeglichen.'
}

function settlementContribution(senderParticipantId: string, amountMinor: bigint): bigint {
  return senderParticipantId === participantId.value ? amountMinor : -amountMinor
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group && participant && balance" class="page-content">
      <NuxtLink :to="`/groups/${group.id}/balances`" class="secondary-link -ml-4 mb-3">← Salden</NuxtLink>
      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">{{ group.name }}</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">{{ participant.name }}</h1>
        <p v-if="participant.status === 'inactive'" class="mt-2 text-gray-600">Inaktiver Teilnehmer</p>
      </header>

      <GroupSyncStatus :group-id="group.id" class="mt-6" />

      <p v-if="group.status === 'archived'" class="card mt-6 p-4">
        Diese archivierte Gruppe ist schreibgeschützt. Der finanzielle Stand bleibt lesbar.
      </p>

      <section class="card mt-6 p-5" aria-labelledby="composition-title">
        <h2 id="composition-title" class="text-xl font-semibold">Zusammensetzung</h2>
        <dl class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt class="text-sm text-gray-600">Ausgaben bezahlt</dt>
            <dd class="font-semibold">{{ formatSignedAmountMinor(balance.paidAmountMinor) }}</dd>
          </div>
          <div>
            <dt class="text-sm text-gray-600">Eigene Anteile</dt>
            <dd class="font-semibold">{{ formatSignedAmountMinor(-balance.shareAmountMinor) }}</dd>
          </div>
          <div><dt class="text-sm text-gray-600">Zahlungen gesendet</dt><dd class="font-semibold">{{ formatSignedAmountMinor(balance.sentSettlementAmountMinor) }}</dd></div>
          <div><dt class="text-sm text-gray-600">Zahlungen erhalten</dt><dd class="font-semibold">{{ formatSignedAmountMinor(-balance.receivedSettlementAmountMinor) }}</dd></div>
          <div>
            <dt class="text-sm text-gray-600">Aktueller Saldo</dt>
            <dd class="font-semibold">{{ formatSignedAmountMinor(balance.balanceAmountMinor) }}</dd>
          </div>
        </dl>
        <p class="mt-4 text-gray-700">{{ balanceText(balance.balanceAmountMinor) }}</p>
      </section>

      <section class="mt-6" aria-labelledby="relevant-settlements-title">
        <h2 id="relevant-settlements-title" class="text-xl font-semibold">Relevante Zahlungen</h2>
        <p v-if="!relevantSettlements.length" class="card mt-3 p-5">Noch keine relevanten Zahlungen.</p>
        <ul v-else class="mt-3 space-y-3"><li v-for="settlement in relevantSettlements" :key="settlement.id"><NuxtLink :to="`/groups/${group.id}/settlements/${settlement.id}`" class="card flex flex-wrap justify-between gap-3 p-4"><span><strong>{{ participantNames.get(settlement.senderParticipantId) }} → {{ participantNames.get(settlement.receiverParticipantId) }}</strong><span class="mt-1 block text-sm text-gray-600">{{ settlement.occurredOn }}</span></span><span class="font-semibold">{{ formatSignedAmountMinor(settlementContribution(settlement.senderParticipantId, settlement.amountMinor)) }}</span></NuxtLink></li></ul>
      </section>

      <section class="mt-6" aria-labelledby="relevant-expenses-title">
        <h2 id="relevant-expenses-title" class="text-xl font-semibold">Relevante Ausgaben</h2>
        <p v-if="!relevantExpenses.length" class="card mt-3 p-5">Noch keine relevanten Ausgaben.</p>
        <ul v-else class="mt-3 space-y-3">
          <li v-for="expense in relevantExpenses" :key="expense.id">
            <NuxtLink :to="`/groups/${group.id}/expenses/${expense.id}`" class="card block p-4">
              <span class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <strong>{{ expense.description }}</strong>
                <span>{{ expense.incurredOn }}</span>
              </span>
              <dl class="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt class="text-gray-600">Bezahlt</dt>
                  <dd class="font-semibold">{{ formatSignedAmountMinor(paidAmount(expense.payerParticipantId, expense.amountMinor)) }}</dd>
                </div>
                <div>
                  <dt class="text-gray-600">Eigener Anteil</dt>
                  <dd class="font-semibold">{{ formatSignedAmountMinor(-shareAmount(expense.id)) }}</dd>
                </div>
              </dl>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>

    <div v-else class="page-content">
      <h1 class="text-3xl font-semibold">Teilnehmer nicht gefunden</h1>
      <NuxtLink :to="`/groups/${groupId}/balances`" class="secondary-link mt-5">Zur Balance-Übersicht</NuxtLink>
    </div>
  </main>
</template>
