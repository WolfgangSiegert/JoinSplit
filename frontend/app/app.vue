<script setup lang="ts">
const lifecycleStore = useApplicationLifecycleStore()
const settingsStore = useSettingsStore()
const nativeApp = useRuntimeConfig().public.nativeApp
const { synchronizePending } = usePendingCreateGroupSync()
const { recordVisit } = useShowcaseTraffic()
const { t } = useAppI18n()
usePendingPersonSync()
useAccountSession()

const systemPrefersDark = ref(import.meta.client && window.matchMedia('(prefers-color-scheme: dark)').matches)
const resolvedColorMode = computed(() => settingsStore.colorMode === 'system'
  ? (systemPrefersDark.value ? 'dark' : 'light')
  : settingsStore.colorMode)
let colorSchemeQuery: MediaQueryList | undefined

useHead(() => ({ htmlAttrs: { lang: settingsStore.resolvedLocale } }))

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
  settingsStore.detectLanguage(navigator.languages)
  colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = colorSchemeQuery.matches
  colorSchemeQuery.addEventListener('change', updateSystemColorScheme)
  void lifecycleStore.initialize()
  void recordVisit()
})

onUnmounted(() => colorSchemeQuery?.removeEventListener('change', updateSystemColorScheme))
</script>

<template>
  <VitePwaManifest v-if="!nativeApp" />
  <UApp>
    <AppHeader />
    <MobileBottomNavigation />
    <ClientOnly v-if="!nativeApp">
      <PwaExperience :synchronize-pending="synchronizePending" />
    </ClientOnly>
    <NuxtPage v-if="lifecycleStore.state === 'ready'" />

    <main v-else-if="lifecycleStore.state === 'loading'" class="page-shell" aria-busy="true">
      <div class="page-content app-loading-state">
        <div class="app-loading-state__mark" aria-hidden="true"><img src="/favicon.svg" alt="" width="48" height="48"></div>
        <h1 class="mt-4 text-3xl font-semibold text-brand-900">{{ t('app.loading.title') }}</h1>
        <p class="mt-3 text-gray-600" role="status">{{ t('app.loading.copy') }}</p>
        <span class="app-loading-state__progress" aria-hidden="true"><i /><i /><i /></span>
      </div>
    </main>

    <main v-else class="page-shell">
      <div class="page-content">
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">{{ t('app.failed.title') }}</h1>
        <div class="card mt-6 border border-red-200 bg-red-50 p-5" role="alert">
          <p>{{ t('app.failed.copy') }}</p>
        </div>
      </div>
    </main>
  </UApp>
</template>
