<script setup lang="ts">
import { formatSettlementAmountMinor } from '../../../../domain/settlement'

const route = useRoute()
const groupsStore = useGroupsStore()
const settingsStore = useSettingsStore()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const settlements = computed(() => groupsStore.settlementsForGroup(groupId.value))
const participantNames = computed(() => new Map(groupsStore.participantsForGroup(groupId.value).map(item => [item.id, item.name])))
const recordingEnabled = computed(() => settingsStore.isSettlementRecordingEnabled(groupId.value))
const recordingEnabledForThisGroup = computed(() => !settingsStore.settlementRecordingEnabled
  && settingsStore.settlementRecordingGroupIds.includes(groupId.value))
const enablingRecording = ref(false)
const recordingError = ref('')

async function enableRecordingForGroup(): Promise<void> {
  if (enablingRecording.value) return
  enablingRecording.value = true
  recordingError.value = ''
  try {
    await settingsStore.enableSettlementRecordingForGroup(groupId.value)
  } catch {
    recordingError.value = 'Die Einstellung konnte nicht lokal gespeichert werden.'
  } finally {
    enablingRecording.value = false
  }
}

async function disableRecordingForGroup(): Promise<void> {
  if (enablingRecording.value) return
  enablingRecording.value = true
  recordingError.value = ''
  try {
    await settingsStore.disableSettlementRecordingForGroup(groupId.value)
  } catch {
    recordingError.value = 'Die Einstellung konnte nicht lokal gespeichert werden.'
  } finally {
    enablingRecording.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3"><AppIcon name="arrow-left" />Gruppen</NuxtLink>
      <header class="min-w-0">
        <p class="break-words text-sm font-semibold tracking-wide text-brand-700">{{ group.name }}</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Zahlungen</h1>
        <p class="mt-2 text-gray-600">Tatsächlich erfolgte Ausgleichszahlungen.</p>
      </header>
      <GroupAreaNavigation :group-id="group.id" />
      <GroupSyncStatus :group-id="group.id" class="mt-6" />
      <p v-if="route.query.deleted === '1'" class="mt-4 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Zahlung lokal gelöscht.</p>
      <p v-if="!settlements.length" class="card mt-6 p-5 text-center">Noch keine Zahlungen erfasst.</p>
      <ul v-else class="mt-6 space-y-3">
        <li v-for="settlement in settlements" :key="settlement.id" class="min-w-0">
          <NuxtLink :to="`/groups/${group.id}/settlements/${settlement.id}`" class="card block min-w-0 p-4">
            <span class="flex min-w-0 flex-wrap justify-between gap-4">
              <strong class="min-w-0 break-words">{{ participantNames.get(settlement.senderParticipantId) }} → {{ participantNames.get(settlement.receiverParticipantId) }}</strong>
              <span>{{ formatSettlementAmountMinor(settlement.amountMinor) }}</span>
            </span>
            <span class="mt-1 block text-sm text-gray-600">{{ settlement.occurredOn }}</span>
          </NuxtLink>
        </li>
      </ul>

      <template v-if="group.status === 'active'">
        <div v-if="recordingEnabled" class="mt-5 grid gap-2" :class="recordingEnabledForThisGroup ? 'sm:grid-cols-2' : ''">
          <NuxtLink :to="`/groups/${group.id}/settlements/new`" class="primary-button w-full">
            <AppIcon name="plus" />Zahlung erfassen
          </NuxtLink>
          <button v-if="recordingEnabledForThisGroup" type="button" class="secondary-button w-full" :disabled="enablingRecording" @click="disableRecordingForGroup">
            <AppIcon name="unlink" />Für diese Gruppe deaktivieren
          </button>
        </div>
        <section v-else class="card mt-5 p-5" aria-labelledby="settlement-recording-disabled">
          <h2 id="settlement-recording-disabled" class="font-semibold">Zahlungen nur bei Bedarf dokumentieren</h2>
          <p class="mt-2 text-sm text-gray-600">
            Das Erfassen von Ausgleichszahlungen ist auf diesem Gerät deaktiviert. Bereits vorhandene Zahlungen bleiben sichtbar.
          </p>
          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" class="primary-button w-full" :disabled="enablingRecording" @click="enableRecordingForGroup">
              <AppIcon name="check" />{{ enablingRecording ? 'Wird aktiviert …' : 'Für diese Gruppe aktivieren' }}
            </button>
            <NuxtLink to="/settings#settlement-recording" class="secondary-button w-full">
              <AppIcon name="settings" />Global einstellen
            </NuxtLink>
          </div>
          <p v-if="recordingError" class="error-text mt-3 text-sm" role="alert">{{ recordingError }}</p>
        </section>
      </template>
      <p v-else class="card mt-5 p-4">Diese archivierte Gruppe ist schreibgeschützt.</p>
    </div>
    <div v-else class="page-content"><h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1></div>
  </main>
</template>
