<script setup lang="ts">
const props = withDefaults(defineProps<{
  groupId: string
  showSynced?: boolean
  pendingDeletion?: boolean
}>(), {
  showSynced: false,
  pendingDeletion: false,
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
  if (visibleState.value === 'failed') return 'bg-red-50 text-red-950'
  if (visibleState.value === 'offline') return 'bg-gray-100 text-gray-800'
  if (visibleState.value === 'synced') return 'bg-brand-50 text-brand-900'
  return 'bg-amber-50 text-amber-950'
})
</script>

<template>
  <div
    v-if="message"
    class="rounded-lg p-3"
    :class="statusClass"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <p>{{ message }}</p>
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
