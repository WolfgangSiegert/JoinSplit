<script setup lang="ts">
import { resetDurableState } from '~/persistence/database'

const settingsStore = useSettingsStore()
const savingAppearance = ref(false)
const appearancePersistenceError = ref('')
const visibleColorModeOverride = ref<'system' | 'light' | 'dark' | null>(null)
const visibleColorMode = computed(() => visibleColorModeOverride.value ?? settingsStore.colorMode)
const visibleDesignOverride = ref<'2' | '3' | null>(null)
const visibleDesign = computed(() => visibleDesignOverride.value ?? settingsStore.visualDesign)
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
const savingSettings = computed(() => savingAppearance.value || savingDefault.value || savingStrategy.value)
const resetDialog = ref<HTMLDialogElement | null>(null)
const resetTrigger = ref<HTMLButtonElement | null>(null)
const resetConfirm = ref<HTMLButtonElement | null>(null)
const resetting = ref(false)
const resetError = ref('')

async function changeColorMode(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).value
  if (value !== 'system' && value !== 'light' && value !== 'dark') return

  visibleColorModeOverride.value = value
  savingAppearance.value = true
  appearancePersistenceError.value = ''
  try {
    await settingsStore.setColorMode(value)
  } catch {
    appearancePersistenceError.value = 'Das Farbschema konnte nicht lokal gespeichert werden.'
  } finally {
    visibleColorModeOverride.value = null
    savingAppearance.value = false
  }
}

async function changeVisualDesign(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).value
  if (value !== '2' && value !== '3') return

  visibleDesignOverride.value = value
  savingAppearance.value = true
  appearancePersistenceError.value = ''
  try {
    await settingsStore.setVisualDesign(value)
  } catch {
    appearancePersistenceError.value = 'Das Design konnte nicht lokal gespeichert werden.'
  } finally {
    visibleDesignOverride.value = null
    savingAppearance.value = false
  }
}

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

async function openResetDialog(): Promise<void> {
  resetError.value = ''
  resetDialog.value?.showModal()
  await nextTick()
  resetConfirm.value?.focus()
}

function cancelReset(): void {
  if (resetting.value) return
  resetDialog.value?.close()
  resetTrigger.value?.focus()
}

async function confirmReset(): Promise<void> {
  if (resetting.value) return
  resetting.value = true
  resetError.value = ''
  try {
    await resetDurableState()
    window.location.replace('/?reset=1')
  } catch {
    resetting.value = false
    resetError.value = 'Die lokalen Daten konnten nicht vollständig zurückgesetzt werden. Es wurde kein Neustart durchgeführt.'
    await nextTick()
    resetConfirm.value?.focus()
  }
}
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3" aria-label="← Gruppen"><AppIcon name="arrow-left" />Gruppen</NuxtLink>

      <header>
        <h1 class="text-3xl font-semibold text-brand-900">Einstellungen</h1>
      </header>

      <section class="card mt-7 p-5" aria-labelledby="appearance-settings">
        <h2 id="appearance-settings" class="text-lg font-semibold">Erscheinungsbild</h2>

        <fieldset class="mt-5">
          <legend class="font-semibold">Farbschema</legend>
          <div class="appearance-options mt-2 grid grid-cols-3 gap-2">
            <label v-for="option in [{ value: 'system', label: 'System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }]" :key="option.value" class="appearance-option">
              <input
                type="radio"
                name="color-mode"
                :value="option.value"
                :checked="visibleColorMode === option.value"
                :disabled="savingSettings"
                @change="changeColorMode"
              >
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>

        <fieldset class="mt-6">
          <legend class="font-semibold">Designsprache</legend>
          <div class="appearance-options mt-2 grid gap-2 sm:grid-cols-2">
            <label class="appearance-option appearance-option--descriptive">
              <input type="radio" name="visual-design" value="2" :checked="visibleDesign === '2'" :disabled="savingSettings" @change="changeVisualDesign">
              <span><strong>Miteinander</strong><small>Warm, rund und personenorientiert</small></span>
            </label>
            <label class="appearance-option appearance-option--descriptive">
              <input type="radio" name="visual-design" value="3" :checked="visibleDesign === '3'" :disabled="savingSettings" @change="changeVisualDesign">
              <span><strong>Klartext</strong><small>Kompakt, kantig und statement-artig</small></span>
            </label>
          </div>
        </fieldset>

        <p class="mt-3 text-sm text-gray-600">Beide Einstellungen gelten für dieses Gerät und ändern keine Gruppendaten.</p>
        <p v-if="appearancePersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ appearancePersistenceError }}
        </p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="group-defaults">
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

      <section id="local-reset" class="card mt-5 border-red-200 p-5" aria-labelledby="local-reset-title">
        <h2 id="local-reset-title" class="text-lg font-semibold">Lokale Daten zurücksetzen</h2>
        <p class="mt-3 text-sm text-gray-700">
          Entfernt alle lokalen Gruppen, Zugangsdaten und ausstehenden Änderungen aus diesem Browser.
          Bereits synchronisierte Serverkopien werden dadurch nicht gelöscht.
        </p>
        <button ref="resetTrigger" type="button" class="danger-button mt-4 w-full" @click="openResetDialog">
          <AppIcon name="trash" />
          Lokale Daten zurücksetzen
        </button>
      </section>

      <NuxtLink to="/demo" class="secondary-link mt-5 -ml-4"><AppIcon name="info" />Demo- und Datenhinweise</NuxtLink>

      <dialog
        ref="resetDialog"
        role="alertdialog"
        class="delete-dialog rounded-2xl p-0"
        aria-labelledby="reset-dialog-title"
        aria-describedby="reset-dialog-description"
        :aria-busy="resetting"
        @cancel.prevent="cancelReset"
      >
        <div class="p-5">
          <h2 id="reset-dialog-title" class="text-xl font-semibold">Lokale Daten endgültig zurücksetzen?</h2>
          <div id="reset-dialog-description" class="mt-3 space-y-3">
            <p>
              Alle Gruppen, Personen, Ausgaben, Zahlungen, Einstellungen, Zugangsdaten und noch nicht
              synchronisierten Änderungen in diesem Browser werden dauerhaft entfernt.
            </p>
            <p>
              Bereits synchronisierte Serverkopien werden nicht gelöscht. Der normale Serverzugriff
              endet 30 Tage nach der letzten angenommenen Änderung. Die automatische Bereinigung läuft
              beim Start und während der kostenlose Dienst aktiv ist; wegen möglicher Free-Tier-Pausen
              gibt es keine feste physische Löschfrist.
            </p>
            <p>
              Nach dem Reset wird eine neue Browser-Identität erstellt. Die alten Daten können nicht
              wiederhergestellt oder über JoinSplit manuell vom Server gelöscht werden.
            </p>
          </div>
          <p v-if="resetError" class="error-text mt-3" role="alert">{{ resetError }}</p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button type="button" class="secondary-button" :disabled="resetting" @click="cancelReset">Abbrechen</button>
            <button ref="resetConfirm" type="button" class="danger-button" :disabled="resetting" @click="confirmReset">
              {{ resetting ? 'Lokale Daten werden gelöscht …' : 'Lokale Daten endgültig löschen' }}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  </main>
</template>
