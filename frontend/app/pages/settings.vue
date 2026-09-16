<script setup lang="ts">
const settingsStore = useSettingsStore()
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3">← Gruppen</NuxtLink>

      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">JoinSplit</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Einstellungen</h1>
      </header>

      <section class="card mt-7 p-5" aria-labelledby="group-defaults">
        <h2 id="group-defaults" class="text-lg font-semibold">Neue Gruppen</h2>
        <label class="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg">
          <input
            v-model="settingsStore.addSelfAsParticipantByDefault"
            type="checkbox"
            class="size-5 shrink-0 accent-brand-600"
          >
          <span class="font-medium">Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen</span>
        </label>
        <p class="mt-3 text-sm text-gray-600">
          Die Auswahl gilt nur für neue Formulare und bleibt in M1 nur in dieser Sitzung erhalten.
        </p>
      </section>
    </div>
  </main>
</template>
