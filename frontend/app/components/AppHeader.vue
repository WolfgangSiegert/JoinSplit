<script setup lang="ts">
import { accountInitials } from '../domain/account-display'

const settingsStore = useSettingsStore()
const accountStore = useAccountStore()
const groupsStore = useGroupsStore()
const route = useRoute()
const { toggleUtility } = useUtilityNavigation()
const { t } = useAppI18n()
const systemPrefersDark = ref(false)
const saving = ref(false)
const persistenceError = ref('')
const createMenu = ref<HTMLDetailsElement | null>(null)
let colorSchemeQuery: MediaQueryList | undefined

const isDark = computed(() => settingsStore.colorMode === 'dark'
  || (settingsStore.colorMode === 'system' && systemPrefersDark.value))
const toggleLabel = computed(() => isDark.value ? t('header.theme.light') : t('header.theme.dark'))
const displayedAccountInitials = computed(() => accountStore.workspace
  ? accountInitials(accountStore.workspace.name, accountStore.workspace.email)
  : '')
const mobileTitle = computed(() => {
  const groupId = typeof route.params.id === 'string' ? route.params.id : null
  const currentGroup = groupId && groupId !== 'new' ? groupsStore.findGroup(groupId) : undefined
  if (currentGroup) return currentGroup.name
  if (route.path === '/groups') return t('nav.groups')
  if (route.path === '/groups/new') return t('header.title.newGroup')
  if (route.path === '/people') return t('nav.people')
  if (route.path === '/account' || route.path === '/account-reset') return t('header.title.account')
  if (route.path === '/settings') return t('nav.settings')
  if (route.path === '/demo') return t('header.title.demo')
  return t('header.title.app')
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
      <NuxtLink to="/" class="mobile-app-header__brand" :aria-label="t('header.home')">
        <img src="/favicon.svg" alt="" width="32" height="32">
      </NuxtLink>
      <span class="mobile-app-header__title">{{ mobileTitle }}</span>
      <div class="mobile-app-header__actions">
        <NuxtLink
          to="/demo"
          class="app-beta-badge app-beta-badge--link"
          :aria-label="t('header.beta')"
          :title="t('header.beta')"
        ><AppIcon name="alert-circle" /><span>Beta</span></NuxtLink>
        <button
          type="button"
          class="mobile-app-header__action"
          :aria-label="accountStore.isAuthenticated ? t('header.account.open') : t('header.signIn')"
          :title="accountStore.isAuthenticated ? t('header.account.title') : t('header.signIn')"
          :aria-pressed="route.path === '/account'"
          @click="toggleUtility('/account')"
        ><span v-if="accountStore.isAuthenticated" class="app-account-initials" aria-hidden="true">{{ displayedAccountInitials }}</span><AppIcon v-else name="account" /></button>
      </div>
    </div>
    <div class="app-header__content app-header__content--desktop">
      <div class="app-brand">
        <NuxtLink to="/" class="app-wordmark" :aria-label="t('header.home')">
          <img class="app-wordmark__icon" src="/favicon.svg" alt="" width="32" height="32">
          <span>JoinSplit</span>
        </NuxtLink>
        <NuxtLink
          to="/demo"
          class="app-beta-badge app-beta-badge--link"
          :aria-label="t('header.beta')"
          :title="t('header.beta')"
        ><AppIcon name="alert-circle" /><span>Beta</span></NuxtLink>
      </div>
      <nav class="app-header__utilities" :aria-label="t('header.quick')">
        <button
          type="button"
          class="icon-button"
          :aria-label="accountStore.isAuthenticated ? t('header.account.openDesktop') : t('header.signIn')"
          :title="accountStore.isAuthenticated ? t('header.account.title') : t('header.signIn')"
          :aria-pressed="route.path === '/account'"
          @click="toggleUtility('/account')"
        ><span v-if="accountStore.isAuthenticated" class="app-account-initials" aria-hidden="true">{{ displayedAccountInitials }}</span><AppIcon v-else name="user" /></button>
        <button type="button" class="icon-button" :aria-label="t('header.settings.open')" :title="t('header.settings.title')" :aria-pressed="route.path === '/settings'" @click="toggleUtility('/settings')"><AppIcon name="settings" /></button>
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
      <nav class="app-header__nav" :aria-label="t('header.main')">
        <NuxtLink to="/groups" class="app-header__action"><AppIcon name="users" /><span>{{ t('nav.groups') }}</span></NuxtLink>
        <NuxtLink to="/people" class="app-header__action"><AppIcon name="user" /><span>{{ t('nav.people') }}</span></NuxtLink>
        <details ref="createMenu" class="app-create-menu">
          <summary class="app-header__action app-create-menu__trigger" role="button" aria-haspopup="menu" :aria-label="t('nav.new')">
            <AppIcon name="plus" /><span>{{ t('nav.new') }}</span><AppIcon name="chevron-down" />
          </summary>
          <div class="app-create-menu__panel" role="menu" :aria-label="t('create.eyebrow')">
            <NuxtLink to="/groups/new" class="app-create-menu__item" role="menuitem" :aria-label="t('header.title.newGroup')" @click="closeCreateMenu"><AppIcon name="users" /><span><strong>{{ t('create.group') }}</strong><small>{{ t('create.groupHint') }}</small></span></NuxtLink>
            <NuxtLink to="/people#person-form" class="app-create-menu__item" role="menuitem" :aria-label="t('header.title.newPerson')" @click="closeCreateMenu"><AppIcon name="user" /><span><strong>{{ t('create.person') }}</strong><small>{{ t('create.personHint') }}</small></span></NuxtLink>
          </div>
        </details>
      </nav>
    </div>
    <p v-if="persistenceError" class="app-header__error" role="alert">{{ persistenceError }}</p>
  </header>
</template>
