<script setup lang="ts">
const props = withDefaults(defineProps<{
  groupId: string
  showSynced?: boolean
  pendingDeletion?: boolean
  compact?: boolean
}>(), {
  showSynced: false,
  pendingDeletion: false,
  compact: false,
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
  <div
    v-if="message"
    :data-state="visibleState"
    :class="[
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
      <p class="text-xs font-extrabold uppercase tracking-wider">{{ stateLabel }}</p>
      <p class="mt-1 text-sm font-medium">{{ message }}</p>
    </template>
    <button
      v-if="canRetry"
      type="button"
      class="secondary-button mt-3"
      @click="attemptSync"
    >
      Synchronisierung erneut versuchen
    </button>
  </div>
</template>
