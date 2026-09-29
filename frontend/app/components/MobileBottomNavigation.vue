<script setup lang="ts">
const route = useRoute()
const groupsStore = useGroupsStore()
const settingsStore = useSettingsStore()
const { toggleUtility } = useUtilityNavigation()
const { t } = useAppI18n()
const createDialog = ref<HTMLDialogElement | null>(null)
const createTrigger = ref<HTMLButtonElement | null>(null)

const groupId = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && value !== 'new' ? value : null
})
const group = computed(() => groupId.value ? groupsStore.findGroup(groupId.value) : undefined)
const canAddToGroup = computed(() => group.value?.status === 'active')
const canRecordSettlement = computed(() => Boolean(
  groupId.value
  && canAddToGroup.value
  && settingsStore.isSettlementRecordingEnabled(groupId.value),
))

const currentSection = computed(() => {
  if (route.path === '/') return 'start'
  if (route.path === '/groups' || route.path.startsWith('/groups/')) return 'groups'
  if (route.path === '/people') return 'people'
  if (route.path === '/settings') return 'settings'
  return ''
})

function openCreateDialog(): void {
  createDialog.value?.showModal()
}

function closeCreateDialog(): void {
  createDialog.value?.close()
  nextTick(() => createTrigger.value?.focus())
}

function closeAfterNavigation(): void {
  createDialog.value?.close()
}

watch(() => route.fullPath, () => createDialog.value?.close())
</script>

<template>
  <nav class="mobile-bottom-navigation" :aria-label="t('nav.main')">
    <NuxtLink to="/" class="mobile-bottom-navigation__item" :aria-current="currentSection === 'start' ? 'page' : undefined">
      <AppIcon name="home" />
      <span>{{ t('nav.start') }}</span>
    </NuxtLink>
    <NuxtLink to="/groups" class="mobile-bottom-navigation__item" :aria-current="currentSection === 'groups' ? 'page' : undefined">
      <AppIcon name="users" />
      <span>{{ t('nav.groups') }}</span>
    </NuxtLink>
    <button ref="createTrigger" type="button" class="mobile-bottom-navigation__item mobile-bottom-navigation__create" aria-haspopup="dialog" @click="openCreateDialog">
      <span class="mobile-bottom-navigation__create-icon"><AppIcon name="plus" /></span>
      <span>{{ t('nav.new') }}</span>
    </button>
    <NuxtLink to="/people" class="mobile-bottom-navigation__item" :aria-current="currentSection === 'people' ? 'page' : undefined">
      <AppIcon name="user" />
      <span>{{ t('nav.people') }}</span>
    </NuxtLink>
    <button type="button" class="mobile-bottom-navigation__item mobile-bottom-navigation__item--settings" :aria-current="currentSection === 'settings' ? 'page' : undefined" :aria-pressed="currentSection === 'settings'" @click="toggleUtility('/settings')">
      <AppIcon name="settings" />
      <span>{{ t('nav.settings') }}</span>
    </button>
  </nav>

  <dialog ref="createDialog" class="mobile-create-dialog" aria-labelledby="mobile-create-title" @cancel.prevent="closeCreateDialog" @click.self="closeCreateDialog">
    <section class="mobile-create-sheet">
      <div class="mobile-create-sheet__handle" aria-hidden="true" />
      <div class="mobile-create-sheet__heading">
        <div>
          <p class="eyebrow">{{ t('create.eyebrow') }}</p>
          <h2 id="mobile-create-title" class="mt-1 text-xl font-bold">
            {{ group ? t('create.inGroup', { name: group.name }) : t('create.question') }}
          </h2>
        </div>
        <button type="button" class="icon-button" :aria-label="t('create.close')" @click="closeCreateDialog"><AppIcon name="x" /></button>
      </div>

      <div class="mobile-create-sheet__actions">
        <NuxtLink v-if="canAddToGroup" :to="`/groups/${groupId}/expenses/new`" class="mobile-create-sheet__action mobile-create-sheet__action--primary" @click="closeAfterNavigation">
          <AppIcon name="receipt" />
          <span><strong>{{ t('create.expense') }}</strong><small>{{ t('create.expenseHint') }}</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
        <NuxtLink v-if="canAddToGroup" :to="`/groups/${groupId}/participants#participant-form`" class="mobile-create-sheet__action" @click="closeAfterNavigation">
          <AppIcon name="user" />
          <span><strong>{{ t('create.participant') }}</strong><small>{{ t('create.participantHint') }}</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
        <NuxtLink v-if="canRecordSettlement" :to="`/groups/${groupId}/settlements/new`" class="mobile-create-sheet__action" @click="closeAfterNavigation">
          <AppIcon name="wallet" />
          <span><strong>{{ t('create.settlement') }}</strong><small>{{ t('create.settlementHint') }}</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
        <NuxtLink to="/groups/new" class="mobile-create-sheet__action" @click="closeAfterNavigation">
          <AppIcon name="users" />
          <span><strong>{{ t('create.group') }}</strong><small>{{ t('create.groupHint') }}</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
        <NuxtLink to="/people#person-form" class="mobile-create-sheet__action" @click="closeAfterNavigation">
          <AppIcon name="user" />
          <span><strong>{{ t('create.person') }}</strong><small>{{ t('create.personHint') }}</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
      </div>
    </section>
  </dialog>
</template>
