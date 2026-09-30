<script setup lang="ts">
import { calculateParticipantBalances, formatSignedAmountMinor } from '../../../../domain/balance'
import {
  createStatementParticipantLabels,
  generateStatementSnapshot,
  type StatementSnapshot,
} from '../../../../domain/statement-snapshot'

const route = useRoute()
const groupsStore = useGroupsStore()
const settingsStore = useSettingsStore()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const settlements = computed(() => groupsStore.settlementsForGroup(groupId.value))
const balances = computed(() => calculateParticipantBalances(
  groupId.value,
  participants.value,
  expenses.value,
  settlements.value,
))
const balanceByParticipantId = computed(() => new Map(
  balances.value.map(balance => [balance.participantId, balance.balanceAmountMinor]),
))
const participantLabels = computed(() => createStatementParticipantLabels(participants.value))
const selectedParticipantId = ref('')
const snapshot = shallowRef<StatementSnapshot | null>(null)
const actionMessage = ref('')
const actionFailed = ref(false)
const shareSupported = ref(false)
const createTitle = ref<HTMLHeadingElement | null>(null)
const previewTitle = ref<HTMLHeadingElement | null>(null)

onMounted(() => {
  shareSupported.value = typeof navigator.share === 'function'
})

function optionLabel(participantId: string): string {
  const participant = participants.value.find(item => item.id === participantId)
  if (!participant) return ''
  const status = participant.status === 'inactive' ? ', inaktiv' : ''
  const balance = balanceByParticipantId.value.get(participant.id) ?? 0n
  return `${participantLabels.value.get(participant.id) ?? participant.name}${status} – ${formatSignedAmountMinor(balance)}`
}

async function createSnapshot(): Promise<void> {
  if (!group.value || !participants.value.some(item => item.id === selectedParticipantId.value)) return

  snapshot.value = generateStatementSnapshot({
    group: group.value,
    participantId: selectedParticipantId.value,
    participants: participants.value,
    expenses: expenses.value,
    settlements: settlements.value,
    pendingMutations: groupsStore.pendingMutations,
    proposalStrategy: settingsStore.settlementProposalStrategy,
    generatedAt: new Date(),
  })
  actionMessage.value = ''
  actionFailed.value = false
  await nextTick()
  previewTitle.value?.focus()
}

async function startNewSnapshot(): Promise<void> {
  snapshot.value = null
  actionMessage.value = ''
  actionFailed.value = false
  await nextTick()
  createTitle.value?.focus()
}

async function copySnapshot(): Promise<void> {
  if (!snapshot.value) return
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(snapshot.value.text)
    actionMessage.value = 'Die Nachricht wurde kopiert.'
    actionFailed.value = false
  } catch {
    actionMessage.value = 'Kopieren war nicht möglich. Die Nachricht kann unten manuell ausgewählt werden.'
    actionFailed.value = true
  }
}

async function shareSnapshot(): Promise<void> {
  if (!snapshot.value || typeof navigator.share !== 'function') return
  try {
    await navigator.share({
      title: 'JoinSplit – dein persönlicher Stand',
      text: snapshot.value.text,
    })
    actionMessage.value = 'Teilen wurde geöffnet.'
    actionFailed.value = false
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      actionMessage.value = ''
      actionFailed.value = false
      return
    }
    actionMessage.value = 'Teilen war nicht möglich. Der Text bleibt zum Kopieren verfügbar.'
    actionFailed.value = true
  }
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink :to="`/groups/${group.id}/balances`" class="secondary-link -ml-4 mb-3" aria-label="← Salden"><AppIcon name="arrow-left" />Salden</NuxtLink>
      <header>
        <p class="break-words text-sm font-semibold tracking-wide text-brand-700">{{ group.name }}</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Deinen Stand teilen</h1>
        <p class="mt-2 text-gray-600">
          Erstelle eine persönliche, leicht verständliche Nachricht. Sie funktioniert auch offline, wird nicht hochgeladen und gibt keinen Zugriff auf die Gruppe.
        </p>
      </header>

      <p v-if="group.status === 'archived'" class="card mt-6 p-4">
        Die Gruppe ist archiviert. Ein lesbarer Stand kann weiterhin erzeugt werden.
      </p>

      <section v-if="!snapshot" class="card mt-6 p-5" aria-labelledby="statement-create-title">
        <h2 id="statement-create-title" ref="createTitle" tabindex="-1" class="text-xl font-semibold">Vorschau erzeugen</h2>
        <template v-if="participants.length">
          <label for="statement-participant" class="mt-4 block font-medium">Teilnehmer</label>
          <select id="statement-participant" v-model="selectedParticipantId" class="field-input mt-2">
            <option value="" disabled>Teilnehmer auswählen</option>
            <option v-for="participant in participants" :key="participant.id" :value="participant.id">
              {{ optionLabel(participant.id) }}
            </option>
          </select>
          <p class="mt-2 text-sm text-gray-600">Auch ein derzeit inaktiver Teilnehmer kann eine Übersicht erhalten.</p>
          <button
            type="button"
            class="primary-button mt-5 w-full"
            :disabled="!selectedParticipantId"
            @click="createSnapshot"
          ><AppIcon name="refresh" />Vorschau erzeugen</button>
        </template>
        <p v-else class="mt-3 text-gray-600">Für diese Gruppe sind keine Teilnehmer vorhanden.</p>
      </section>

      <section v-else class="mt-6" aria-labelledby="statement-preview-title">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="statement-preview-title" ref="previewTitle" tabindex="-1" class="text-xl font-semibold">Vorschau</h2>
          <button type="button" class="secondary-button" @click="startNewSnapshot"><AppIcon name="refresh" />Neue Vorschau erzeugen</button>
        </div>
        <p class="mt-3 text-sm text-gray-600">
          Diese Vorschau ist eingefroren. Spätere lokale Änderungen verändern ihren Inhalt nicht.
        </p>
        <p v-if="snapshot.containsUnsyncedChanges" class="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950" role="status">
          Die Übersicht enthält Änderungen, die bisher nur auf diesem Gerät gespeichert sind.
        </p>
        <label for="statement-text" class="mt-4 block font-medium">Nachrichtenvorschau</label>
        <textarea
          id="statement-text"
          class="field-input mt-2 min-h-80 resize-y whitespace-pre-wrap font-mono text-sm"
          :value="snapshot.text"
          readonly
        />
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" class="primary-button" @click="copySnapshot"><AppIcon name="copy" />Nachricht kopieren</button>
          <button v-if="shareSupported" type="button" class="secondary-button" @click="shareSnapshot"><AppIcon name="share" />Teilen</button>
        </div>
        <p v-if="!shareSupported" class="mt-3 text-sm text-gray-600">
          Direktes Teilen ist auf diesem Gerät nicht verfügbar. Die Nachricht kann kopiert oder manuell markiert werden.
        </p>
        <p
          v-if="actionMessage"
          class="mt-3 text-sm"
          :class="actionFailed ? 'error-text' : 'text-brand-700'"
          :role="actionFailed ? 'alert' : 'status'"
          aria-live="polite"
        >{{ actionMessage }}</p>
      </section>
    </div>

    <div v-else class="page-content">
      <h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1>
      <p class="mt-3 text-gray-600">Der lokale Gruppenstand ist nicht vorhanden.</p>
      <NuxtLink to="/groups" class="primary-button mt-6">Zur Gruppenliste</NuxtLink>
    </div>
  </main>
</template>
