<script setup lang="ts">
import { calculateParticipantBalances, formatSignedAmountMinor } from '../../../../domain/balance'

const route = useRoute()
const groupsStore = useGroupsStore()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const balances = computed(() => calculateParticipantBalances(groupId.value, participants.value, expenses.value))
const participantById = computed(() => new Map(participants.value.map(participant => [participant.id, participant])))
const allBalanced = computed(() => balances.value.length > 0 && balances.value.every(balance => balance.balanceAmountMinor === 0n))

function balanceText(amountMinor: bigint): string {
  if (amountMinor > 0n) return `Soll erhalten: ${formatSignedAmountMinor(amountMinor)}`
  if (amountMinor < 0n) return `Soll zahlen: ${formatSignedAmountMinor(amountMinor)}`
  return `Ausgeglichen: ${formatSignedAmountMinor(amountMinor)}`
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3">← Gruppen</NuxtLink>
      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">{{ group.name }}</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Salden</h1>
        <p class="mt-2 text-gray-600">Berechnet aus den lokal gespeicherten Ausgaben dieser Gruppe.</p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <GroupSyncStatus :group-id="group.id" class="mt-6" />

      <p v-if="group.status === 'archived'" class="card mt-6 p-4">
        Diese archivierte Gruppe ist schreibgeschützt. Ihre Salden bleiben lesbar.
      </p>

      <section v-if="!participants.length" class="card mt-6 px-5 py-8 text-center" aria-labelledby="empty-participants">
        <h2 id="empty-participants" class="text-xl font-semibold">Noch keine Teilnehmer</h2>
        <p class="mt-2 text-gray-600">Für die Balance-Berechnung werden Teilnehmer benötigt.</p>
      </section>

      <template v-else>
        <p v-if="!expenses.length" class="card mt-6 p-4">
          Noch keine Ausgaben. Alle Teilnehmer sind derzeit ausgeglichen.
        </p>
        <p v-else-if="allBalanced" class="card mt-6 p-4">
          Alle Teilnehmer sind ausgeglichen.
        </p>

        <section class="mt-6" aria-labelledby="participant-balances">
          <h2 id="participant-balances" class="text-xl font-semibold">Salden pro Teilnehmer</h2>
          <ul class="mt-3 space-y-3">
            <li v-for="balance in balances" :key="balance.participantId">
              <NuxtLink
                :to="`/groups/${group.id}/balances/${balance.participantId}`"
                class="card block p-4"
              >
                <span class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <span>
                    <strong>{{ participantById.get(balance.participantId)?.name }}</strong>
                    <span v-if="participantById.get(balance.participantId)?.status === 'inactive'" class="ml-2 text-sm text-gray-600">Inaktiv</span>
                  </span>
                  <span class="font-semibold">{{ formatSignedAmountMinor(balance.balanceAmountMinor) }}</span>
                </span>
                <span class="mt-1 block text-sm text-gray-700">{{ balanceText(balance.balanceAmountMinor) }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <div v-else class="page-content">
      <h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1>
      <p class="mt-3 text-gray-600">Der lokale Gruppenstand ist nicht vorhanden.</p>
      <NuxtLink to="/" class="primary-button mt-6">Zur Gruppenliste</NuxtLink>
    </div>
  </main>
</template>
