<script setup lang="ts">
const lifecycleStore = useApplicationLifecycleStore()
const settingsStore = useSettingsStore()
usePendingCreateGroupSync()

const systemPrefersDark = ref(import.meta.client && window.matchMedia('(prefers-color-scheme: dark)').matches)
const resolvedColorMode = computed(() => settingsStore.colorMode === 'system'
  ? (systemPrefersDark.value ? 'dark' : 'light')
  : settingsStore.colorMode)
let colorSchemeQuery: MediaQueryList | undefined

function updateSystemColorScheme(event: MediaQueryListEvent): void {
  systemPrefersDark.value = event.matches
}

watch([resolvedColorMode, () => settingsStore.visualDesign], ([colorMode, visualDesign]) => {
  if (!import.meta.client) return
  document.documentElement.dataset.theme = colorMode
  document.documentElement.dataset.design = visualDesign
  document.documentElement.style.colorScheme = colorMode
}, { immediate: true })

onMounted(() => {
  colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = colorSchemeQuery.matches
  colorSchemeQuery.addEventListener('change', updateSystemColorScheme)
  void lifecycleStore.initialize()
})

onUnmounted(() => colorSchemeQuery?.removeEventListener('change', updateSystemColorScheme))
</script>

<template>
  <VitePwaManifest />
  <UApp>
    <AppHeader />
    <NuxtPage v-if="lifecycleStore.state === 'ready'" />

    <main v-else-if="lifecycleStore.state === 'loading'" class="page-shell" aria-busy="true">
      <div class="page-content">
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Lokale Daten werden geladen</h1>
        <p class="mt-3 text-gray-600" role="status">Einen Moment bitte.</p>
      </div>
    </main>

    <main v-else class="page-shell">
      <div class="page-content">
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Lokale Daten nicht verfügbar</h1>
        <div class="card mt-6 border border-red-200 bg-red-50 p-5" role="alert">
          <p>
            Deine lokalen Daten konnten nicht sicher geladen werden. Sie wurden nicht gelöscht oder
            ersetzt. Bitte schließe die Anwendung und versuche es erneut.
          </p>
        </div>
      </div>
    </main>
  </UApp>
</template>
