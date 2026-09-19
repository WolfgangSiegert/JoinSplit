<script setup lang="ts">
const route = useRoute()
const groupsStore = useGroupsStore()
const heading = ref<HTMLHeadingElement | null>(null)
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const { syncState, visibleState, attemptSync } = useCreateGroupSync(groupId)

const syncMessage = computed(() => {
  if (visibleState.value === 'offline') {
    return 'Offline. Die Gruppe bleibt lokal nutzbar und wird später synchronisiert.'
  }
  if (visibleState.value === 'syncing') {
    return 'Synchronisierung läuft. Die Gruppe bleibt lokal nutzbar.'
  }
  if (visibleState.value === 'synced') {
    return 'Synchronisiert. Die Gruppe wurde vom Server bestätigt.'
  }
  if (visibleState.value === 'failed') {
    return syncState.value?.error?.message ?? 'Synchronisierung fehlgeschlagen.'
  }
  return 'Synchronisierung ausstehend. Die Gruppe ist lokal nutzbar.'
})

const canRetry = computed(
  () => visibleState.value === 'failed' && syncState.value?.error?.retryable === true,
)
const syncClass = computed(() => {
  if (visibleState.value === 'failed') return 'bg-red-50 text-red-950'
  if (visibleState.value === 'offline') return 'bg-gray-100 text-gray-800'
  if (visibleState.value === 'synced') return 'bg-brand-50 text-brand-900'
  return 'bg-amber-50 text-amber-950'
})

onMounted(async () => {
  if (route.query.created === '1' && group.value) {
    await nextTick()
    heading.value?.focus()
  }
})
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3">← Gruppen</NuxtLink>

      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">Gruppe</p>
        <h1 ref="heading" tabindex="-1" class="mt-2 text-3xl font-semibold text-brand-900">
          {{ group.name }}
        </h1>
        <p class="mt-2 text-gray-600">Währung: {{ group.currency }}</p>
      </header>

      <div class="mt-6 space-y-3">
        <p v-if="route.query.created === '1'" class="rounded-lg bg-brand-50 p-3 text-brand-900">
          Gruppe lokal erstellt.
        </p>
        <div
          class="rounded-lg p-3"
          :class="syncClass"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p>{{ syncMessage }}</p>
          <button
            v-if="canRetry"
            type="button"
            class="secondary-button mt-3"
            @click="attemptSync"
          >
            Synchronisierung erneut versuchen
          </button>
        </div>
      </div>

      <section class="card mt-7 px-5 py-8 text-center" aria-labelledby="empty-expenses">
        <h2 id="empty-expenses" class="text-xl font-semibold">Noch keine Ausgaben</h2>
        <p class="mt-2 text-gray-600">Erfasste Ausgaben erscheinen später hier.</p>
      </section>
    </div>

    <div v-else class="page-content">
      <h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1>
      <p class="mt-3 text-gray-600">Der lokale Gruppenstand ist in dieser Sitzung nicht vorhanden.</p>
      <NuxtLink to="/" class="primary-button mt-6">Zur Gruppenliste</NuxtLink>
    </div>
  </main>
</template>
