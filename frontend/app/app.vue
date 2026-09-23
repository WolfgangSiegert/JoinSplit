<script setup lang="ts">
const lifecycleStore = useApplicationLifecycleStore()
usePendingCreateGroupSync()

onMounted(() => {
  void lifecycleStore.initialize()
})
</script>

<template>
  <UApp>
    <NuxtPage v-if="lifecycleStore.state === 'ready'" />

    <main v-else-if="lifecycleStore.state === 'loading'" class="page-shell" aria-busy="true">
      <div class="page-content">
        <p class="text-sm font-semibold tracking-wide text-brand-700">JoinSplit</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Lokale Daten werden geladen</h1>
        <p class="mt-3 text-gray-600" role="status">Einen Moment bitte.</p>
      </div>
    </main>

    <main v-else class="page-shell">
      <div class="page-content">
        <p class="text-sm font-semibold tracking-wide text-brand-700">JoinSplit</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Lokale Daten nicht verfügbar</h1>
        <div class="card mt-6 border border-red-200 bg-red-50 p-5" role="alert">
          <p>
            Deine lokalen Daten konnten nicht sicher geladen werden. Sie wurden nicht gelöscht oder
            ersetzt. Bitte schließe die Anwendung und versuche es erneut.
          </p>
        </div>
      </div>
    </main>
  </UApp>
</template>
