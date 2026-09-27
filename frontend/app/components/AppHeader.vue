<script setup lang="ts">
const settingsStore = useSettingsStore()
const accountStore = useAccountStore()
const groupsStore = useGroupsStore()
const route = useRoute()
const systemPrefersDark = ref(false)
const saving = ref(false)
const persistenceError = ref('')
const createMenu = ref<HTMLDetailsElement | null>(null)
let colorSchemeQuery: MediaQueryList | undefined

const isDark = computed(() => settingsStore.colorMode === 'dark'
  || (settingsStore.colorMode === 'system' && systemPrefersDark.value))
const toggleLabel = computed(() => isDark.value ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren')
const mobileTitle = computed(() => {
  const groupId = typeof route.params.id === 'string' ? route.params.id : null
  const currentGroup = groupId && groupId !== 'new' ? groupsStore.findGroup(groupId) : undefined
  if (currentGroup) return currentGroup.name
  if (route.path === '/groups') return 'Gruppen'
  if (route.path === '/groups/new') return 'Neue Gruppe'
  if (route.path === '/people') return 'Personen'
  if (route.path === '/account' || route.path === '/account-reset') return 'Konto'
  if (route.path === '/settings') return 'Einstellungen'
  if (route.path === '/demo') return 'Demo & Daten'
  return 'JoinSplit'
})

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

function closeCreateMenu(): void {
  if (createMenu.value) createMenu.value.open = false
}

watch(() => route.fullPath, closeCreateMenu)

onMounted(() => {
  colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = colorSchemeQuery.matches
  colorSchemeQuery.addEventListener('change', updateSystemColorScheme)
})

onUnmounted(() => colorSchemeQuery?.removeEventListener('change', updateSystemColorScheme))
</script>

<template>
  <header class="app-header">
    <div class="mobile-app-header">
      <NuxtLink to="/" class="mobile-app-header__brand" aria-label="JoinSplit – Startseite">
        <img src="/favicon.svg" alt="" width="32" height="32">
      </NuxtLink>
      <span class="mobile-app-header__title">{{ mobileTitle }}</span>
      <span class="app-beta-badge" aria-label="Beta-Version">Beta</span>
    </div>
    <div class="app-header__content app-header__content--desktop">
      <div class="app-brand">
        <NuxtLink to="/" class="app-wordmark" aria-label="JoinSplit – Startseite">
          <img class="app-wordmark__icon" src="/favicon.svg" alt="" width="32" height="32">
          <span>JoinSplit</span>
        </NuxtLink>
        <span class="app-beta-badge" aria-label="Beta-Version">Beta</span>
      </div>
      <nav class="app-header__utilities" aria-label="Schnellzugriff">
        <NuxtLink to="/demo" class="icon-button" aria-label="Demo und Daten" title="Demo und Daten"><AppIcon name="database" /></NuxtLink>
        <NuxtLink
          to="/account"
          class="icon-button"
          :aria-label="accountStore.isAuthenticated ? 'Account öffnen' : 'Anmelden oder registrieren'"
          :title="accountStore.isAuthenticated ? 'Account' : 'Anmelden oder registrieren'"
        ><AppIcon name="user" /></NuxtLink>
        <NuxtLink to="/settings" class="icon-button" aria-label="Einstellungen öffnen" title="Einstellungen"><AppIcon name="settings" /></NuxtLink>
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
      </nav>
      <nav class="app-header__nav" aria-label="Hauptnavigation">
        <NuxtLink to="/groups" class="app-header__action"><AppIcon name="users" /><span>Gruppen</span></NuxtLink>
        <NuxtLink to="/people" class="app-header__action"><AppIcon name="user" /><span>Personen</span></NuxtLink>
        <details ref="createMenu" class="app-create-menu">
          <summary class="app-header__action app-create-menu__trigger" role="button" aria-haspopup="menu" aria-label="Neu">
            <AppIcon name="plus" /><span>Neu</span><AppIcon name="chevron-down" />
          </summary>
          <div class="app-create-menu__panel" role="menu" aria-label="Neu anlegen">
            <NuxtLink to="/groups/new" class="app-create-menu__item" role="menuitem" aria-label="Neue Gruppe" @click="closeCreateMenu"><AppIcon name="users" /><span><strong>Gruppe</strong><small>Gemeinsame Ausgaben starten</small></span></NuxtLink>
            <NuxtLink to="/people#person-form" class="app-create-menu__item" role="menuitem" aria-label="Neue Person" @click="closeCreateMenu"><AppIcon name="user" /><span><strong>Person</strong><small>Für spätere Gruppen vormerken</small></span></NuxtLink>
          </div>
        </details>
      </nav>
    </div>
    <p v-if="persistenceError" class="app-header__error" role="alert">{{ persistenceError }}</p>
  </header>
</template>
