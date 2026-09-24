<script setup lang="ts">
import { calculateParticipantBalances, formatSignedAmountMinor } from '../../../../domain/balance'
import { formatSettlementAmountMinor } from '../../../../domain/settlement'
import {
  EXACT_NON_ZERO_PARTICIPANT_LIMIT,
  proposeDeterministicSettlements,
  proposeMinimumTransferSettlements,
} from '../../../../domain/settlement-proposal'

const route = useRoute()
const groupsStore = useGroupsStore()
const settingsStore = useSettingsStore()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const settlements = computed(() => groupsStore.settlementsForGroup(groupId.value))
const balances = computed(() => calculateParticipantBalances(groupId.value, participants.value, expenses.value, settlements.value))
const participantById = computed(() => new Map(participants.value.map(participant => [participant.id, participant])))
const allBalanced = computed(() => balances.value.length > 0 && balances.value.every(balance => balance.balanceAmountMinor === 0n))
const savingStrategy = ref(false)
const strategyPersistenceError = ref('')
const visibleStrategyOverride = ref<'deterministic' | 'minimum-transfer' | null>(null)
const visibleStrategy = computed(() => visibleStrategyOverride.value ?? settingsStore.settlementProposalStrategy)
const proposalParticipants = computed(() => balances.value.map((balance) => {
  const participant = participantById.value.get(balance.participantId)
  return {
    participantId: balance.participantId,
    participantOrder: participant?.order ?? -1,
    status: participant?.status ?? 'active',
    balanceAmountMinor: balance.balanceAmountMinor.toString(10),
  }
}))
const deterministicProposal = computed(() => proposeDeterministicSettlements(proposalParticipants.value))
const minimumTransferProposal = computed(() => proposeMinimumTransferSettlements(proposalParticipants.value))
const nonZeroParticipantCount = computed(() => proposalParticipants.value
  .filter(participant => participant.balanceAmountMinor !== '0')
  .length)
const minimumTransferUnavailable = computed(() => nonZeroParticipantCount.value > EXACT_NON_ZERO_PARTICIPANT_LIMIT)
const visibleProposal = computed(() => visibleStrategy.value === 'minimum-transfer'
  ? minimumTransferProposal.value
  : deterministicProposal.value)

function balanceText(amountMinor: bigint): string {
  if (amountMinor > 0n) return `Soll erhalten: ${formatSignedAmountMinor(amountMinor)}`
  if (amountMinor < 0n) return `Soll zahlen: ${formatSignedAmountMinor(amountMinor)}`
  return `Ausgeglichen: ${formatSignedAmountMinor(amountMinor)}`
}

function participantName(participantId: string): string {
  return participantById.value.get(participantId)?.name ?? 'Unbekannter Teilnehmer'
}

function participantIsInactive(participantId: string): boolean {
  return participantById.value.get(participantId)?.status === 'inactive'
}

async function changeSettlementStrategy(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value
  if (value !== 'deterministic' && value !== 'minimum-transfer') return

  visibleStrategyOverride.value = value
  savingStrategy.value = true
  strategyPersistenceError.value = ''
  try {
    await settingsStore.setSettlementProposalStrategy(value)
  } catch {
    strategyPersistenceError.value = 'Die Strategie konnte nicht lokal gespeichert werden.'
  } finally {
    visibleStrategyOverride.value = null
    savingStrategy.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3">← Gruppen</NuxtLink>
      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">{{ group.name }}</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Salden</h1>
        <p class="mt-2 text-gray-600">Berechnet aus den lokal gespeicherten Ausgaben und Zahlungen dieser Gruppe.</p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <GroupSyncStatus :group-id="group.id" class="mt-6" />

      <NuxtLink :to="`/groups/${group.id}/settlements`" class="secondary-button mt-5 w-full">Erfasste Zahlungen verwalten</NuxtLink>
      <NuxtLink :to="`/groups/${group.id}/balances/statement`" class="secondary-button mt-3 w-full">Persönlichen Stand teilen</NuxtLink>

      <p v-if="group.status === 'archived'" class="card mt-6 p-4">
        Diese archivierte Gruppe ist schreibgeschützt. Ihre Salden bleiben lesbar.
      </p>

      <section v-if="!participants.length" class="card mt-6 px-5 py-8 text-center" aria-labelledby="empty-participants">
        <h2 id="empty-participants" class="text-xl font-semibold">Noch keine Teilnehmer</h2>
        <p class="mt-2 text-gray-600">Für die Balance-Berechnung werden Teilnehmer benötigt.</p>
      </section>

      <template v-else>
        <p v-if="!expenses.length && !settlements.length" class="card mt-6 p-4">
          Noch keine Ausgaben oder Zahlungen. Alle Teilnehmer sind derzeit ausgeglichen.
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

        <section class="card mt-6 p-5" aria-labelledby="settlement-proposal">
          <h2 id="settlement-proposal" class="text-xl font-semibold">Ausgleichsvorschlag</h2>
          <p class="mt-2 text-sm text-gray-600">
            Der Vorschlag ist nur eine Rechenhilfe und keine erfasste Zahlung.
          </p>

          <label for="balance-settlement-strategy" class="mt-4 block font-medium">Strategie</label>
          <select
            id="balance-settlement-strategy"
            class="field-input mt-2"
            :value="visibleStrategy"
            :disabled="savingStrategy"
            aria-describedby="balance-settlement-strategy-help"
            @change="changeSettlementStrategy"
          >
            <option value="deterministic">Einfacher deterministischer Ausgleich</option>
            <option
              value="minimum-transfer"
              :disabled="minimumTransferUnavailable"
            >Möglichst wenige Zahlungen</option>
          </select>
          <p id="balance-settlement-strategy-help" class="mt-2 text-sm text-gray-600">
            Die Auswahl gilt auf diesem Gerät. Sie erfasst und verändert keine Zahlungen.
            <span v-if="minimumTransferUnavailable" class="mt-1 block">
              „Möglichst wenige Zahlungen“ ist bei {{ nonZeroParticipantCount }} offenen Salden deaktiviert; unterstützt werden höchstens {{ EXACT_NON_ZERO_PARTICIPANT_LIMIT }}.
            </span>
          </p>
          <p v-if="strategyPersistenceError" class="error-text mt-3 text-sm" role="alert">
            {{ strategyPersistenceError }}
          </p>

          <div v-if="visibleProposal.status === 'unavailable'" class="mt-4 rounded-lg bg-gray-100 p-4" role="status">
            <p class="font-medium">Für diese Gruppe sind möglichst wenige Zahlungen nicht verfügbar.</p>
            <p class="mt-1 text-sm text-gray-700">
              Aktuell haben {{ visibleProposal.nonZeroParticipantCount }} Teilnehmer einen offenen Saldo. Diese Strategie unterstützt höchstens {{ visibleProposal.limit }}. Es wird kein anderer Vorschlag als Ersatz angezeigt.
            </p>
          </div>

          <template v-else-if="visibleProposal.status === 'success'">
            <p v-if="visibleProposal.transfers.length === 0" class="mt-4 rounded-lg bg-gray-100 p-4" role="status">
              Es ist keine Ausgleichszahlung nötig.
            </p>
            <ol v-else class="mt-4 space-y-3" aria-label="Vorgeschlagene Zahlungen">
              <li
                v-for="transfer in visibleProposal.transfers"
                :key="`${transfer.senderParticipantId}:${transfer.receiverParticipantId}`"
                class="rounded-lg border border-gray-200 p-4"
              >
                <p class="break-words font-medium">
                  {{ participantName(transfer.senderParticipantId) }}
                  <span v-if="participantIsInactive(transfer.senderParticipantId)" class="font-normal text-gray-600">(inaktiv)</span>
                  zahlt
                  {{ participantName(transfer.receiverParticipantId) }}
                  <span v-if="participantIsInactive(transfer.receiverParticipantId)" class="font-normal text-gray-600">(inaktiv)</span>
                </p>
                <p class="mt-1 text-lg font-semibold">{{ formatSettlementAmountMinor(BigInt(transfer.amountMinor)) }}</p>
              </li>
            </ol>
          </template>

          <div v-else class="mt-4 rounded-lg bg-red-50 p-4 text-red-900" role="alert">
            <p class="font-medium">Der Ausgleichsvorschlag kann nicht berechnet werden.</p>
            <p class="mt-1 text-sm">Die zugrunde liegenden Salden sind ungültig. Es wurden keine Zahlungen verändert.</p>
          </div>
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
