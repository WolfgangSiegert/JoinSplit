<script setup lang="ts">
const settingsStore = useSettingsStore()
const systemPrefersDark = ref(false)
const saving = ref(false)
const persistenceError = ref('')
let colorSchemeQuery: MediaQueryList | undefined

const isDark = computed(() => settingsStore.colorMode === 'dark'
  || (settingsStore.colorMode === 'system' && systemPrefersDark.value))
const toggleLabel = computed(() => isDark.value ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren')

function updateSystemColorScheme(event: MediaQueryListEvent): void {
  systemPrefersDark.value = event.matches
}

async function toggleColorMode(): Promise<void> {
  if (saving.value) return
  saving.value = true
  persistenceError.value = ''
  try {
    await settingsStore.setColorMode(isDark.value ? 'light' : 'dark')
  } catch {
    persistenceError.value = 'Das Farbschema konnte nicht lokal gespeichert werden.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = colorSchemeQuery.matches
  colorSchemeQuery.addEventListener('change', updateSystemColorScheme)
})

onUnmounted(() => colorSchemeQuery?.removeEventListener('change', updateSystemColorScheme))
</script>

<template>
  <header class="app-header">
    <div class="app-header__content">
      <div class="app-brand">
        <NuxtLink to="/" class="app-wordmark" aria-label="JoinSplit – Startseite">
          <img class="app-wordmark__icon" src="/favicon.svg" alt="" width="32" height="32">
          <span>JoinSplit</span>
        </NuxtLink>
        <span class="app-beta-badge" aria-label="Beta-Version">Beta</span>
      </div>
      <button
        type="button"
        class="theme-toggle"
        :class="{ 'theme-toggle--dark': isDark }"
        :aria-label="toggleLabel"
        :title="toggleLabel"
        :aria-pressed="isDark"
        :disabled="saving"
        @click="toggleColorMode"
      >
        <span class="theme-toggle__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
          </svg>
        </span>
        <span class="theme-toggle__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
          </svg>
        </span>
      </button>
    </div>
    <p v-if="persistenceError" class="app-header__error" role="alert">{{ persistenceError }}</p>
  </header>
</template>
