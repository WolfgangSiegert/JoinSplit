<script setup lang="ts">
const settingsStore = useSettingsStore()
const savingDefault = ref(false)
const defaultPersistenceError = ref('')
const visibleDefaultOverride = ref<boolean | null>(null)
const visibleDefault = computed(() =>
  visibleDefaultOverride.value ?? settingsStore.addSelfAsParticipantByDefault,
)
const savingStrategy = ref(false)
const strategyPersistenceError = ref('')
const visibleStrategyOverride = ref<'deterministic' | 'minimum-transfer' | null>(null)
const visibleStrategy = computed(() =>
  visibleStrategyOverride.value ?? settingsStore.settlementProposalStrategy,
)
const savingSettings = computed(() => savingDefault.value || savingStrategy.value)

async function changeDefault(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).checked
  visibleDefaultOverride.value = value
  savingDefault.value = true
  defaultPersistenceError.value = ''
  try {
    await settingsStore.setAddSelfAsParticipantByDefault(value)
  } catch {
    defaultPersistenceError.value = 'Die Einstellung konnte nicht lokal gespeichert werden.'
  } finally {
    visibleDefaultOverride.value = null
    savingDefault.value = false
  }
}

async function changeSettlementStrategy(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value
  if (value !== 'deterministic' && value !== 'minimum-transfer') return

  visibleStrategyOverride.value = value
  savingStrategy.value = true
  strategyPersistenceError.value = ''
  try {
    await settingsStore.setSettlementProposalStrategy(value)
  } catch {
    strategyPersistenceError.value = 'Die Strategie konnte nicht lokal gespeichert werden.'
  } finally {
    visibleStrategyOverride.value = null
    savingStrategy.value = false
  }
}
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
            :checked="visibleDefault"
            type="checkbox"
            class="size-5 shrink-0 accent-brand-600"
            :disabled="savingSettings"
            @change="changeDefault"
          >
          <span class="font-medium">Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen</span>
        </label>
        <p class="mt-3 text-sm text-gray-600">
          Die Auswahl gilt nur für neue Formulare und bleibt auf diesem Gerät gespeichert.
        </p>
        <p v-if="defaultPersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ defaultPersistenceError }}
        </p>
      </section>
      <section class="card mt-5 p-5" aria-labelledby="settlement-defaults">
        <h2 id="settlement-defaults" class="text-lg font-semibold">Ausgleichsvorschläge</h2>
        <label for="settlement-strategy" class="mt-4 block font-medium">Standardstrategie</label>
        <select id="settlement-strategy" class="field-input mt-2" :value="visibleStrategy" :disabled="savingSettings" @change="changeSettlementStrategy">
          <option value="deterministic">Einfacher deterministischer Ausgleich</option>
          <option value="minimum-transfer">Möglichst wenige Zahlungen</option>
        </select>
        <p class="mt-3 text-sm text-gray-600">Die Auswahl bleibt auf diesem Gerät gespeichert und ändert keine bereits erfassten Zahlungen.</p>
        <p v-if="strategyPersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ strategyPersistenceError }}
        </p>
      </section>
    </div>
  </main>
</template>
