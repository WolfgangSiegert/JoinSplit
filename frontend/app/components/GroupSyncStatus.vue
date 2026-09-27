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

const message = computed(() => {
  if (visibleState.value === 'offline') {
    return props.pendingDeletion
      ? 'Offline. Die Gruppenlöschung bleibt lokal vorgemerkt und wird später synchronisiert.'
      : 'Offline. Die Gruppe bleibt lokal nutzbar und wird später synchronisiert.'
  }
  if (visibleState.value === 'syncing') {
    return props.pendingDeletion ? 'Die Gruppenlöschung wird synchronisiert.' : 'Synchronisierung läuft. Die Gruppe bleibt lokal nutzbar.'
  }
  if (visibleState.value === 'failed') {
    return syncState.value?.error?.message ?? 'Synchronisierung fehlgeschlagen.'
  }
  if (visibleState.value === 'pending') {
    return props.pendingDeletion ? 'Die endgültige Gruppenlöschung ist noch nicht synchronisiert.' : 'Synchronisierung ausstehend. Die Gruppe ist lokal nutzbar.'
  }
  return props.showSynced ? 'Synchronisiert. Die Gruppe wurde vom Server bestätigt.' : ''
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
  if (visibleState.value === 'failed') return 'Fehler'
  if (visibleState.value === 'offline') return 'Offline'
  if (visibleState.value === 'synced') return 'Aktuell'
  if (visibleState.value === 'syncing') return 'Wird synchronisiert'
  return 'Ausstehend'
})
</script>

<template>
  <div v-if="message" :class="['group-sync-status', { 'group-sync-status--mobile-collapsible': props.mobileCollapsible }]" :data-state="visibleState">
    <span v-if="props.mobileCollapsible" class="sr-only" role="status" aria-live="polite">{{ stateLabel }}: {{ message }}</span>
    <details v-if="props.mobileCollapsible" class="group-sync-status__mobile-details">
      <summary :class="['group-sync-status__mobile-summary', statusClass]" :aria-label="`${stateLabel}: Details anzeigen`">
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
          aria-label="Synchronisierung erneut versuchen"
          @click="attemptSync"
        >
          <AppIcon name="refresh" />Erneut versuchen
        </button>
      </div>
    </details>
    <div
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
        <span>Synchronisiert</span>
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
        aria-label="Synchronisierung erneut versuchen"
        @click="attemptSync"
      >
        <AppIcon name="refresh" /><span class="group-sync-status__retry-full">Synchronisierung erneut versuchen</span><span class="group-sync-status__retry-short">Erneut</span>
      </button>
    </div>
  </div>
</template>
