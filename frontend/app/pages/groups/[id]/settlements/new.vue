<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const settingsStore = useSettingsStore()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const recordingEnabled = computed(() => settingsStore.isSettlementRecordingEnabled(groupId.value))
const heading = ref<HTMLHeadingElement | null>(null)
const enablingRecording = ref(false)
const recordingError = ref('')

function saved(settlement: { id: string }): void {
  void router.push(`/groups/${groupId.value}/settlements/${settlement.id}?created=1`)
}

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

onMounted(async () => {
  await nextTick()
  heading.value?.focus()
})
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink :to="`/groups/${group.id}/settlements`" class="secondary-link -ml-4 mb-3"><AppIcon name="arrow-left" />Zahlungen</NuxtLink>
      <header class="min-w-0">
        <p class="break-words text-sm font-semibold tracking-wide text-brand-700">{{ group.name }}</p>
        <h1 ref="heading" tabindex="-1" class="mt-2 text-3xl font-semibold text-brand-900">Zahlung erfassen</h1>
      </header>
      <div v-if="group.status === 'archived'" class="card mt-6 p-5" role="alert">Archivierte Gruppen können nicht geändert werden.</div>
      <section v-else-if="!recordingEnabled" class="card mt-6 p-5" role="alert" aria-labelledby="settlement-recording-required">
        <h2 id="settlement-recording-required" class="font-semibold">Zahlungen erfassen ist deaktiviert</h2>
        <p class="mt-2 text-sm text-gray-600">
          JoinSplit berechnet weiterhin Ausgleichsvorschläge. Aktiviere die Dokumentation nur, wenn du tatsächlich erfolgte Zahlungen festhalten möchtest.
        </p>
        <div class="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" class="primary-button w-full" :disabled="enablingRecording" @click="enableRecordingForGroup">
            <AppIcon name="check" />{{ enablingRecording ? 'Wird aktiviert …' : 'Für diese Gruppe aktivieren' }}
          </button>
          <NuxtLink to="/settings#settlement-recording" class="secondary-button w-full"><AppIcon name="settings" />Global einstellen</NuxtLink>
        </div>
        <p v-if="recordingError" class="error-text mt-3 text-sm">{{ recordingError }}</p>
      </section>
      <SettlementForm v-else class="mt-6" :group-id="group.id" @saved="saved" />
    </div>
    <div v-else class="page-content"><h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1></div>
  </main>
</template>
