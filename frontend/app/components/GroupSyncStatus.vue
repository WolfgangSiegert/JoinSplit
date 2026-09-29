<script setup lang="ts">
const props = withDefaults(defineProps<{
  groupId: string
  showSynced?: boolean
  pendingDeletion?: boolean
  compact?: boolean
  mobileCollapsible?: boolean
}>(), {
  showSynced: false,
  pendingDeletion: false,
  compact: false,
  mobileCollapsible: false,
})

const groupId = computed(() => props.groupId)
const { syncState, visibleState, attemptSync } = useCreateGroupSync(groupId)
const { t } = useAppI18n()

const failedMessage = computed(() => {
  switch (syncState.value?.error?.kind) {
    case 'network': return t('sync.error.network')
    case 'unauthorized': return t('sync.error.unauthorized')
    case 'forbidden': return t('sync.error.forbidden')
    case 'not-found': return t('sync.error.notFound')
    case 'session-expired':
    case 'expired': return t('sync.error.sessionExpired')
    case 'conflict':
    case 'reconciliation': return t('sync.error.conflict')
    case 'validation': return t('sync.error.validation')
    case 'persistence': return t('sync.error.persistence')
    case undefined: return t('sync.failed')
    default: return t('sync.error.generic')
  }
})

const message = computed(() => {
  if (visibleState.value === 'offline') {
    return props.pendingDeletion
      ? t('sync.offline.deletion')
      : t('sync.offline.group')
  }
  if (visibleState.value === 'syncing') {
    return props.pendingDeletion ? t('sync.syncing.deletion') : t('sync.syncing.group')
  }
  if (visibleState.value === 'failed') {
    return failedMessage.value
  }
  if (visibleState.value === 'pending') {
    return props.pendingDeletion ? t('sync.pending.deletion') : t('sync.pending.group')
  }
  return props.showSynced ? t('sync.synced.copy') : ''
})

const canRetry = computed(() => visibleState.value === 'failed'
  && syncState.value?.error?.retryable === true)
const statusClass = computed(() => {
  if (visibleState.value === 'failed') return 'border-red-200 bg-red-50 text-red-950'
  if (visibleState.value === 'offline') return 'border-gray-300 bg-gray-100 text-gray-800'
  if (visibleState.value === 'synced') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  return 'border-amber-300 bg-amber-50 text-amber-950'
})

const stateLabel = computed(() => {
  if (visibleState.value === 'failed') return t('sync.state.failed')
  if (visibleState.value === 'offline') return t('sync.state.offline')
  if (visibleState.value === 'synced') return t('sync.state.synced')
  if (visibleState.value === 'syncing') return t('sync.state.syncing')
  return t('sync.state.pending')
})
</script>

<template>
  <div v-if="message" :class="['group-sync-status', { 'group-sync-status--mobile-collapsible': props.mobileCollapsible }]" :data-state="visibleState">
    <span v-if="props.mobileCollapsible" class="sr-only" role="status" aria-live="polite">{{ stateLabel }}: {{ message }}</span>
    <details v-if="props.mobileCollapsible" class="group-sync-status__mobile-details">
      <summary :class="['group-sync-status__mobile-summary', statusClass]" :aria-label="t('sync.details', { state: stateLabel })">
        <AppIcon :name="visibleState === 'syncing' ? 'refresh' : 'info'" />
        <span>{{ stateLabel }}</span>
        <AppIcon name="chevron-down" />
      </summary>
      <div :class="['group-sync-status__mobile-panel', statusClass]">
        <p class="group-sync-status__message">{{ message }}</p>
        <button
          v-if="canRetry"
          type="button"
          class="secondary-button group-sync-status__retry mt-3"
          :aria-label="t('sync.retry')"
          @click="attemptSync"
        >
          <AppIcon name="refresh" />{{ t('sync.retry.short') }}
        </button>
      </div>
    </details>
    <div
      v-if="!props.mobileCollapsible"
      :class="[
        'group-sync-status__full',
        props.compact && visibleState === 'synced' ? 'inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm font-bold' : 'status-panel',
        statusClass,
      ]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <template v-if="props.compact && visibleState === 'synced'">
        <span>{{ t('sync.state.synced') }}</span>
      </template>
      <template v-else>
        <div class="group-sync-status__content">
          <AppIcon :name="visibleState === 'syncing' ? 'refresh' : 'info'" class="mt-0.5" />
          <span>
            <strong class="block text-xs font-extrabold uppercase tracking-wider">{{ stateLabel }}</strong>
            <span class="group-sync-status__message">{{ message }}</span>
          </span>
        </div>
      </template>
      <button
        v-if="canRetry"
        type="button"
        class="secondary-button group-sync-status__retry mt-3"
        :aria-label="t('sync.retry')"
        @click="attemptSync"
      >
        <AppIcon name="refresh" /><span class="group-sync-status__retry-full">{{ t('sync.retry') }}</span><span class="group-sync-status__retry-short">{{ t('sync.retry.short') }}</span>
      </button>
    </div>
  </div>
</template>
