<script setup lang="ts">
import { calculateParticipantBalances, formatSignedAmountMinor } from '../../../../domain/balance'
import { formatSettlementAmountMinor } from '../../../../domain/settlement'
import { createSettlementOverviewImage } from '../../../../utils/settlement-overview-image'
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
const proposalTotalAmountMinor = computed(() => visibleProposal.value.status === 'success'
  ? visibleProposal.value.transfers.reduce((sum, transfer) => sum + BigInt(transfer.amountMinor), 0n)
  : 0n)
const visibleStrategyLabel = computed(() => visibleStrategy.value === 'minimum-transfer'
  ? 'Möglichst wenige Zahlungen'
  : 'Einfacher, stabiler Ausgleich')
const sharingOverview = ref(false)
const overviewShareMessage = ref('')
const overviewShareFailed = ref(false)
const overviewImageBlob = shallowRef<Blob | null>(null)
const overviewImageUrl = ref('')
const overviewImageFilename = ref('')
const overviewCanShare = ref(false)

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

function participantIndex(participantId: string): number {
  return Math.max(0, participants.value.findIndex(participant => participant.id === participantId))
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

function createOverviewImage(): void {
  if (!group.value || sharingOverview.value) return
  sharingOverview.value = true
  overviewShareMessage.value = ''
  overviewShareFailed.value = false
  try {
    const proposal = visibleProposal.value
    const image = createSettlementOverviewImage({
      groupName: group.value.name,
      generatedAt: new Date(),
      containsUnsyncedChanges: groupsStore.pendingMutations.some(mutation => mutation.groupId === group.value!.id),
      balances: balances.value.map(balance => ({
        name: participantName(balance.participantId),
        status: participantById.value.get(balance.participantId)?.status ?? 'active',
        state: balance.balanceAmountMinor > 0n ? 'receives' : balance.balanceAmountMinor < 0n ? 'pays' : 'balanced',
        amount: formatSignedAmountMinor(balance.balanceAmountMinor),
      })),
      transfers: proposal.status === 'success'
        ? proposal.transfers.map(transfer => ({
            sender: participantName(transfer.senderParticipantId),
            receiver: participantName(transfer.receiverParticipantId),
            amount: formatSettlementAmountMinor(BigInt(transfer.amountMinor)),
          }))
        : null,
      proposalMessage: proposal.status === 'unavailable'
        ? `Nicht verfügbar bei ${proposal.nonZeroParticipantCount} offenen Salden.`
        : proposal.status === 'invalid'
          ? 'Der Ausgleichsvorschlag konnte nicht berechnet werden.'
          : undefined,
    })
    const filename = `joinsplit-ausgleich-${safeFilename(group.value.name)}.png`
    const file = new File([image.blob], filename, { type: 'image/png' })
    overviewImageBlob.value = image.blob
    overviewImageUrl.value = image.dataUrl
    overviewImageFilename.value = filename
    overviewCanShare.value = typeof navigator.share === 'function'
      && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }))
    overviewShareMessage.value = 'Die Bildübersicht ist eingefroren und bereit.'
  } catch (error) {
    overviewShareMessage.value = 'Die Bildübersicht konnte nicht erstellt werden.'
    overviewShareFailed.value = true
  } finally {
    sharingOverview.value = false
  }
}

async function shareOrDownloadOverviewImage(): Promise<void> {
  if (!group.value || !overviewImageBlob.value || !overviewImageFilename.value) return
  overviewShareMessage.value = ''
  overviewShareFailed.value = false
  const file = new File([overviewImageBlob.value], overviewImageFilename.value, { type: 'image/png' })
  try {
    if (overviewCanShare.value) {
      await navigator.share({ title: `${group.value.name} – Ausgleichsübersicht`, files: [file] })
      overviewShareMessage.value = 'Die Bildübersicht wurde zum Teilen geöffnet.'
    } else {
      downloadBlob(overviewImageBlob.value, overviewImageFilename.value)
      overviewShareMessage.value = 'Die Bildübersicht wurde als PNG heruntergeladen.'
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    overviewShareMessage.value = 'Die Bildübersicht konnte nicht geteilt werden.'
    overviewShareFailed.value = true
  }
}

function closeOverviewImage(): void {
  overviewImageBlob.value = null
  overviewImageUrl.value = ''
  overviewImageFilename.value = ''
  overviewShareMessage.value = ''
}

function safeFilename(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
  return normalized.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'gruppe'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3">← Gruppen</NuxtLink>
      <header>
        <p class="eyebrow">{{ group.name }}</p>
        <h1 class="mt-2 text-4xl font-bold text-ink-900">Salden</h1>
        <p class="mt-2 text-ink-700">Wer bekommt noch Geld, wer zahlt noch?</p>
        <p class="mt-2 text-sm text-ink-700">Berechnet aus den lokal gespeicherten Ausgaben und Zahlungen dieser Gruppe.</p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <GroupSyncStatus :group-id="group.id" class="mt-6" />

      <div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <NuxtLink :to="`/groups/${group.id}/settlements`" class="secondary-button w-full">Zahlungen</NuxtLink>
        <NuxtLink :to="`/groups/${group.id}/balances/statement`" class="secondary-button w-full">Persönlichen Stand teilen</NuxtLink>
        <button type="button" class="secondary-button w-full" :disabled="sharingOverview" @click="createOverviewImage">
          <UIcon name="i-lucide-image" class="size-5" aria-hidden="true" />
          {{ sharingOverview ? 'Bild wird erstellt …' : overviewImageUrl ? 'Bild aktualisieren' : 'Übersicht als Bild' }}
        </button>
      </div>
      <p
        v-if="overviewShareMessage"
        class="mt-3 text-sm"
        :class="overviewShareFailed ? 'error-text' : 'text-brand-700'"
        :role="overviewShareFailed ? 'alert' : 'status'"
        aria-live="polite"
      >{{ overviewShareMessage }}</p>
      <section v-if="overviewImageUrl" class="card mt-4 p-4" aria-labelledby="overview-image-preview-title">
        <div class="flex items-center justify-between gap-3">
          <h2 id="overview-image-preview-title" class="text-lg font-semibold">Bildvorschau</h2>
          <span class="text-sm text-ink-700">PNG</span>
        </div>
        <img
          :src="overviewImageUrl"
          class="mt-3 w-full rounded-lg border border-gray-200"
          alt="Vorschau der eingefrorenen Ausgleichsübersicht"
        >
        <p class="mt-3 text-sm text-ink-700">
          Dieses PNG bleibt unverändert. Spätere Änderungen an der Gruppe erscheinen erst nach „Bild aktualisieren“.
        </p>
        <div class="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" class="primary-button" @click="shareOrDownloadOverviewImage">
            {{ overviewCanShare ? 'Bild teilen' : 'PNG herunterladen' }}
          </button>
          <button type="button" class="secondary-button" @click="closeOverviewImage">Vorschau schließen</button>
        </div>
      </section>

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
          <h2 id="participant-balances" class="text-2xl font-bold">Salden pro Teilnehmer</h2>
          <ul class="ledger-list mt-3">
            <li v-for="(balance, index) in balances" :key="balance.participantId">
              <NuxtLink
                :to="`/groups/${group.id}/balances/${balance.participantId}`"
                class="ledger-row"
              >
                <ParticipantAvatar :name="participantById.get(balance.participantId)?.name ?? '?'" :index="index" size="lg" />
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <strong>{{ participantById.get(balance.participantId)?.name }}</strong>
                    <span v-if="participantById.get(balance.participantId)?.status === 'inactive'" class="ml-2 text-sm text-gray-600">Inaktiv</span>
                    <span class="amount-value">{{ formatSignedAmountMinor(balance.balanceAmountMinor) }}</span>
                  </span>
                  <span class="mt-1 block text-sm text-ink-700">{{ balanceText(balance.balanceAmountMinor) }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section class="settlement-proposal mt-8" aria-label="Ausgleichsvorschlag">
          <div class="settlement-proposal__heading">
            <div>
              <p class="eyebrow">Nächster Schritt</p>
              <h2 id="settlement-proposal" class="mt-1 text-2xl font-bold">So gleicht ihr aus</h2>
            </div>
            <div v-if="visibleProposal.status === 'success' && visibleProposal.transfers.length" class="settlement-proposal__summary" aria-label="Zusammenfassung des Vorschlags">
              <strong>{{ visibleProposal.transfers.length }} {{ visibleProposal.transfers.length === 1 ? 'Zahlung' : 'Zahlungen' }}</strong>
              <span>{{ formatSettlementAmountMinor(proposalTotalAmountMinor) }} insgesamt</span>
            </div>
          </div>

          <p class="settlement-proposal__notice mt-4">
            <UIcon name="i-lucide-info" class="size-5 shrink-0" aria-hidden="true" />
            <span><strong>Noch nicht verbucht.</strong> Der Vorschlag ist nur eine Rechenhilfe und keine erfasste Zahlung. Erfasste Zahlungen erscheinen unter „Zahlungen“.</span>
          </p>

          <div v-if="visibleProposal.status === 'unavailable'" class="mt-4 rounded-lg bg-gray-100 p-4" role="status">
            <p class="font-medium">Für diese Gruppe sind möglichst wenige Zahlungen nicht verfügbar.</p>
            <p class="mt-1 text-sm text-gray-700">
              Aktuell haben {{ visibleProposal.nonZeroParticipantCount }} Teilnehmer einen offenen Saldo. Diese Strategie unterstützt höchstens {{ visibleProposal.limit }}. Es wird kein anderer Vorschlag als Ersatz angezeigt.
            </p>
          </div>

          <template v-else-if="visibleProposal.status === 'success'">
            <p v-if="visibleProposal.transfers.length === 0" class="settlement-proposal__balanced mt-4" role="status">
              <UIcon name="i-lucide-circle-check" class="size-6 shrink-0" aria-hidden="true" />
              <span><strong>Alles ausgeglichen.</strong> Es ist keine Ausgleichszahlung nötig.</span>
            </p>
            <ol v-else class="settlement-transfer-list mt-4" aria-label="Vorgeschlagene Zahlungen">
              <li
                v-for="(transfer, index) in visibleProposal.transfers"
                :key="`${transfer.senderParticipantId}:${transfer.receiverParticipantId}`"
                class="settlement-transfer"
              >
                <p class="sr-only">
                  Schritt {{ index + 1 }}: {{ participantName(transfer.senderParticipantId) }}<span v-if="participantIsInactive(transfer.senderParticipantId)"> (inaktiv)</span> zahlt {{ participantName(transfer.receiverParticipantId) }}<span v-if="participantIsInactive(transfer.receiverParticipantId)"> (inaktiv)</span>. Betrag: {{ formatSettlementAmountMinor(BigInt(transfer.amountMinor)) }}.
                </p>
                <div class="settlement-transfer__top" aria-hidden="true">
                  <span class="settlement-transfer__step">{{ index + 1 }}</span>
                </div>
                <div class="settlement-transfer__flow" aria-hidden="true">
                  <div class="settlement-transfer__person">
                    <ParticipantAvatar :name="participantName(transfer.senderParticipantId)" :index="participantIndex(transfer.senderParticipantId)" size="sm" />
                    <span><small>Zahlt</small><strong>{{ participantName(transfer.senderParticipantId) }}</strong><small v-if="participantIsInactive(transfer.senderParticipantId)">Inaktiv</small></span>
                  </div>
                  <div class="settlement-transfer__direction">
                    <span class="settlement-transfer__caret-group settlement-transfer__caret-group--payer">
                      <UIcon name="i-lucide-chevron-right" class="settlement-transfer__caret settlement-transfer__caret--owes" />
                      <UIcon name="i-lucide-chevron-right" class="settlement-transfer__caret settlement-transfer__caret--warm" />
                      <UIcon name="i-lucide-chevron-right" class="settlement-transfer__caret settlement-transfer__caret--mid-left" />
                    </span>
                    <strong class="settlement-transfer__amount">{{ formatSettlementAmountMinor(BigInt(transfer.amountMinor)) }}</strong>
                    <span class="settlement-transfer__caret-group settlement-transfer__caret-group--receiver">
                      <UIcon name="i-lucide-chevron-right" class="settlement-transfer__caret settlement-transfer__caret--mid-right" />
                      <UIcon name="i-lucide-chevron-right" class="settlement-transfer__caret settlement-transfer__caret--cool" />
                      <UIcon name="i-lucide-chevron-right" class="settlement-transfer__caret settlement-transfer__caret--receives" />
                    </span>
                  </div>
                  <div class="settlement-transfer__person settlement-transfer__person--receiver">
                    <ParticipantAvatar :name="participantName(transfer.receiverParticipantId)" :index="participantIndex(transfer.receiverParticipantId)" size="sm" />
                    <span><small>Erhält</small><strong>{{ participantName(transfer.receiverParticipantId) }}</strong><small v-if="participantIsInactive(transfer.receiverParticipantId)">Inaktiv</small></span>
                  </div>
                </div>
              </li>
            </ol>
            <NuxtLink v-if="visibleProposal.transfers.length && group.status === 'active'" :to="`/groups/${group.id}/settlements/new`" class="primary-button mt-4 w-full">
              Zahlung erfassen
            </NuxtLink>
          </template>

          <div v-else class="mt-4 rounded-lg bg-red-50 p-4 text-red-900" role="alert">
            <p class="font-medium">Der Ausgleichsvorschlag kann nicht berechnet werden.</p>
            <p class="mt-1 text-sm">Die zugrunde liegenden Salden sind ungültig. Es wurden keine Zahlungen verändert.</p>
          </div>

          <details class="settlement-strategy mt-4">
            <summary>
              <span><small>Berechnung</small><strong>{{ visibleStrategyLabel }}</strong></span>
              <UIcon name="i-lucide-chevron-down" class="size-5" aria-hidden="true" />
            </summary>
            <div class="settlement-strategy__content">
              <label for="balance-settlement-strategy" class="block font-medium">Strategie</label>
              <select
                id="balance-settlement-strategy"
                class="field-input mt-2"
                :value="visibleStrategy"
                :disabled="savingStrategy"
                aria-describedby="balance-settlement-strategy-help"
                @change="changeSettlementStrategy"
              >
                <option value="deterministic">Einfacher deterministischer Ausgleich</option>
                <option value="minimum-transfer" :disabled="minimumTransferUnavailable">Möglichst wenige Zahlungen</option>
              </select>
              <p id="balance-settlement-strategy-help" class="mt-2 text-sm text-gray-600">
                Die Auswahl gilt auf diesem Gerät. Sie erfasst und verändert keine Zahlungen.
                <span v-if="minimumTransferUnavailable" class="mt-1 block">
                  „Möglichst wenige Zahlungen“ ist bei {{ nonZeroParticipantCount }} offenen Salden deaktiviert; unterstützt werden höchstens {{ EXACT_NON_ZERO_PARTICIPANT_LIMIT }}.
                </span>
              </p>
              <p v-if="strategyPersistenceError" class="error-text mt-3 text-sm" role="alert">{{ strategyPersistenceError }}</p>
            </div>
          </details>
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
