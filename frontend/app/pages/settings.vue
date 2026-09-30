<script setup lang="ts">
import { resetDurableState } from '~/persistence/database'
import { GROUP_AREA_PRESENTATION, type GroupArea } from '~/domain/group-area'
import { updateAccountDefaultGroupArea, updateAccountGroupAreaOrder, updateAccountLanguagePreference } from '~/services/account'
import { isLanguagePreference } from '~/domain/locale'

const settingsStore = useSettingsStore()
const accountStore = useAccountStore()
const route = useRoute()
const config = useRuntimeConfig()
const { closeUtility } = useUtilityNavigation()
const nativeApp = config.public.nativeApp
const { t } = useAppI18n()
const savingAppearance = ref(false)
const appearancePersistenceError = ref('')
const visibleColorModeOverride = ref<'system' | 'light' | 'dark' | null>(null)
const visibleColorMode = computed(() => visibleColorModeOverride.value ?? settingsStore.colorMode)
const visibleDesignOverride = ref<'2' | '3' | '4' | '5' | null>(null)
const visibleDesign = computed(() => visibleDesignOverride.value ?? settingsStore.visualDesign)
const savingDefault = ref(false)
const savingDefaultName = ref(false)
const defaultPersistenceError = ref('')
const defaultName = ref(settingsStore.defaultParticipantName || accountStore.workspace?.name || '')
const defaultNamePersistenceError = ref('')
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
const savingSettlementRecording = ref(false)
const savingGroupAreaOrder = ref(false)
const savingDefaultGroupArea = ref(false)
const savingLanguage = ref(false)
const languagePersistenceError = ref('')
const groupAreaOrderPersistenceError = ref('')
const defaultGroupAreaPersistenceError = ref('')
const settlementRecordingPersistenceError = ref('')
const visibleSettlementRecordingOverride = ref<boolean | null>(null)
const visibleSettlementRecording = computed(() =>
  visibleSettlementRecordingOverride.value ?? settingsStore.settlementRecordingEnabled,
)
const savingSettings = computed(() => savingAppearance.value || savingDefault.value || savingDefaultName.value || savingStrategy.value || savingSettlementRecording.value || savingGroupAreaOrder.value || savingDefaultGroupArea.value || savingLanguage.value)
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
  if (value !== '2' && value !== '3' && value !== '4' && value !== '5') return

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

async function saveDefaultName(): Promise<void> {
  savingDefaultName.value = true
  defaultNamePersistenceError.value = ''
  try {
    await settingsStore.setDefaultParticipantName(defaultName.value)
    defaultName.value = settingsStore.defaultParticipantName
  } catch {
    defaultName.value = settingsStore.defaultParticipantName || accountStore.workspace?.name || ''
    defaultNamePersistenceError.value = 'Der Name konnte nicht lokal gespeichert werden.'
  } finally {
    savingDefaultName.value = false
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

async function changeSettlementRecording(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).checked
  visibleSettlementRecordingOverride.value = value
  savingSettlementRecording.value = true
  settlementRecordingPersistenceError.value = ''
  try {
    await settingsStore.setSettlementRecordingEnabled(value)
  } catch {
    settlementRecordingPersistenceError.value = 'Die Einstellung konnte nicht lokal gespeichert werden.'
  } finally {
    visibleSettlementRecordingOverride.value = null
    savingSettlementRecording.value = false
  }
}

async function moveGroupArea(area: GroupArea, direction: -1 | 1): Promise<void> {
  if (savingGroupAreaOrder.value) return
  const order = [...settingsStore.groupAreaOrder]
  const currentIndex = order.indexOf(area)
  const targetIndex = currentIndex + direction
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return
  ;[order[currentIndex], order[targetIndex]] = [order[targetIndex]!, order[currentIndex]!]

  savingGroupAreaOrder.value = true
  groupAreaOrderPersistenceError.value = ''
  try {
    await settingsStore.setGroupAreaOrder(order)
    if (accountStore.hasActiveSession) {
      try {
        await updateAccountGroupAreaOrder(config.public.apiBase, order)
      } catch {
        groupAreaOrderPersistenceError.value = 'Die Reihenfolge wurde nur auf diesem Gerät gespeichert. Speichere sie bei aktiver Verbindung erneut, um sie im Account zu übernehmen.'
      }
    }
  } catch {
    groupAreaOrderPersistenceError.value = 'Die Reihenfolge konnte nicht lokal gespeichert werden.'
  } finally {
    savingGroupAreaOrder.value = false
  }
}

async function changeDefaultGroupArea(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).value as GroupArea
  if (!settingsStore.groupAreaOrder.includes(value) || savingDefaultGroupArea.value) return

  savingDefaultGroupArea.value = true
  defaultGroupAreaPersistenceError.value = ''
  try {
    await settingsStore.setDefaultGroupArea(value)
    if (accountStore.hasActiveSession) {
      try {
        await updateAccountDefaultGroupArea(config.public.apiBase, value)
      } catch {
        defaultGroupAreaPersistenceError.value = t('settings.tabs.defaultError.account')
      }
    }
  } catch {
    defaultGroupAreaPersistenceError.value = t('settings.tabs.defaultError.local')
  } finally {
    savingDefaultGroupArea.value = false
  }
}

async function changeLanguage(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).value
  if (!isLanguagePreference(value) || savingLanguage.value) return
  savingLanguage.value = true
  languagePersistenceError.value = ''
  try {
    await settingsStore.setLanguagePreference(value)
    if (accountStore.hasActiveSession) {
      try {
        await updateAccountLanguagePreference(config.public.apiBase, value)
      } catch {
        languagePersistenceError.value = t('settings.language.error.account')
      }
    }
  } catch {
    languagePersistenceError.value = t('settings.language.error.local')
  } finally {
    savingLanguage.value = false
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
      <div class="utility-page-heading">
        <header>
          <h1 class="text-3xl font-semibold text-brand-900">{{ t('settings.title') }}</h1>
        </header>
        <button type="button" class="icon-button utility-page-heading__close" :aria-label="t('settings.close')" :title="t('common.close')" @click="closeUtility"><AppIcon name="x" /></button>
      </div>

      <section class="card mt-7 p-5" aria-labelledby="account-settings">
        <h2 id="account-settings" class="text-lg font-semibold">{{ t('settings.account.title') }}</h2>
        <p class="mt-2 text-sm text-gray-600">{{ t('settings.account.copy') }}</p>
        <NuxtLink :to="{ path: '/account', query: { returnTo: route.fullPath } }" class="secondary-button mt-4 w-full"><AppIcon name="users" />{{ t('settings.account.manage') }}</NuxtLink>
      </section>

      <ClientOnly v-if="!nativeApp">
        <PwaSettingsPanel class="mt-5" />
        <template #fallback>
          <section class="card mt-5 p-5" aria-labelledby="app-installation-loading">
            <h2 id="app-installation-loading" class="text-lg font-semibold">App-Installation</h2>
            <p class="mt-2 text-sm text-gray-600">Installationsstatus wird geprüft …</p>
          </section>
        </template>
      </ClientOnly>

      <section class="card mt-5 p-5" aria-labelledby="appearance-settings">
        <h2 id="appearance-settings" class="text-lg font-semibold">{{ t('settings.appearance.title') }}</h2>

        <fieldset class="mt-5">
          <legend class="font-semibold">{{ t('settings.appearance.color') }}</legend>
          <div class="appearance-options color-mode-options mt-2 grid grid-cols-3 gap-2">
            <label v-for="option in [{ value: 'system', label: t('settings.appearance.system') }, { value: 'light', label: t('settings.appearance.light') }, { value: 'dark', label: t('settings.appearance.dark') }]" :key="option.value" class="appearance-option">
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
          <legend class="font-semibold">{{ t('settings.appearance.design') }}</legend>
          <div class="appearance-options design-options mt-2 grid gap-2 sm:grid-cols-2">
            <label class="appearance-option appearance-option--descriptive">
              <input type="radio" name="visual-design" value="2" :checked="visibleDesign === '2'" :disabled="savingSettings" @change="changeVisualDesign">
              <span><strong>{{ t('settings.appearance.together') }}</strong><small>{{ t('settings.appearance.togetherHint') }}</small></span>
            </label>
            <label class="appearance-option appearance-option--descriptive">
              <input type="radio" name="visual-design" value="3" :checked="visibleDesign === '3'" :disabled="savingSettings" @change="changeVisualDesign">
              <span><strong>{{ t('settings.appearance.plain') }}</strong><small>{{ t('settings.appearance.plainHint') }}</small></span>
            </label>
            <label class="appearance-option appearance-option--descriptive">
              <input type="radio" name="visual-design" value="4" :checked="visibleDesign === '4'" :disabled="savingSettings" @change="changeVisualDesign">
              <span><strong>{{ t('settings.appearance.material') }}</strong><small>{{ t('settings.appearance.materialHint') }}</small></span>
            </label>
            <label class="appearance-option appearance-option--descriptive">
              <input type="radio" name="visual-design" value="5" :checked="visibleDesign === '5'" :disabled="savingSettings" @change="changeVisualDesign">
              <span><strong>{{ t('settings.appearance.ios') }}</strong><small>{{ t('settings.appearance.iosHint') }}</small></span>
            </label>
          </div>
        </fieldset>

        <p class="mt-3 text-sm text-gray-600">{{ t('settings.appearance.note') }}</p>
        <p v-if="appearancePersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ appearancePersistenceError }}
        </p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="language-settings">
        <h2 id="language-settings" class="text-lg font-semibold">{{ t('settings.language.title') }}</h2>
        <fieldset class="mt-4">
          <legend class="sr-only">{{ t('settings.language.legend') }}</legend>
          <div class="appearance-options language-options grid gap-2">
            <label v-for="option in [
              { value: 'system', label: t('settings.language.system') },
              { value: 'de', label: t('settings.language.german') },
              { value: 'en', label: t('settings.language.english') },
            ]" :key="option.value" class="appearance-option">
              <input type="radio" name="language" :value="option.value" :checked="settingsStore.languagePreference === option.value" :disabled="savingSettings" @change="changeLanguage">
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
        <p class="mt-3 text-sm text-gray-600">{{ accountStore.hasActiveSession ? t('settings.language.note.account') : t('settings.language.note.local') }}</p>
        <p v-if="languagePersistenceError" class="error-text mt-3 text-sm" role="alert">{{ languagePersistenceError }}</p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="group-navigation-settings">
        <h2 id="group-navigation-settings" class="text-lg font-semibold">{{ t('settings.tabs.title') }}</h2>
        <p class="mt-2 text-sm text-gray-600">{{ t('settings.tabs.copy') }}</p>
        <ol class="group-area-order mt-4" :aria-label="t('settings.tabs.order')">
          <li v-for="(area, index) in settingsStore.groupAreaOrder" :key="area" class="group-area-order__item">
            <span class="group-area-order__position" aria-hidden="true">{{ index + 1 }}</span>
            <AppIcon :name="GROUP_AREA_PRESENTATION[area].icon" />
            <strong>{{ t(`nav.area.${area}`) }}</strong>
            <span class="group-area-order__controls">
              <button
                type="button"
                class="group-area-order__button"
                :aria-label="t('settings.tabs.up', { label: t(`nav.area.${area}`) })"
                :disabled="savingSettings || index === 0"
                @click="moveGroupArea(area, -1)"
              >↑</button>
              <button
                type="button"
                class="group-area-order__button"
                :aria-label="t('settings.tabs.down', { label: t(`nav.area.${area}`) })"
                :disabled="savingSettings || index === settingsStore.groupAreaOrder.length - 1"
                @click="moveGroupArea(area, 1)"
              >↓</button>
            </span>
          </li>
        </ol>
        <fieldset class="mt-5 border-t border-gray-300 pt-4">
          <legend class="font-semibold">{{ t('settings.tabs.defaultTitle') }}</legend>
          <p class="mt-1 text-sm text-gray-600">{{ t('settings.tabs.defaultCopy') }}</p>
          <div class="appearance-options mt-3 grid gap-2">
            <label v-for="area in settingsStore.groupAreaOrder" :key="area" class="appearance-option">
              <input
                type="radio"
                name="default-group-area"
                :value="area"
                :checked="settingsStore.defaultGroupArea === area"
                :disabled="savingSettings"
                @change="changeDefaultGroupArea"
              >
              <span class="flex items-center gap-2"><AppIcon :name="GROUP_AREA_PRESENTATION[area].icon" />{{ t(`nav.area.${area}`) }}</span>
            </label>
          </div>
          <p v-if="defaultGroupAreaPersistenceError" class="error-text mt-3 text-sm" role="alert">{{ defaultGroupAreaPersistenceError }}</p>
        </fieldset>
        <p class="mt-3 text-sm text-gray-600">
          {{ accountStore.hasActiveSession ? t('settings.tabs.note.account') : t('settings.tabs.note.local') }}
        </p>
        <p v-if="groupAreaOrderPersistenceError" class="error-text mt-3 text-sm" role="alert">{{ groupAreaOrderPersistenceError }}</p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="group-defaults">
        <h2 id="group-defaults" class="text-lg font-semibold">{{ t('settings.groups.title') }}</h2>
        <label for="default-participant-name" class="mt-4 block font-medium">{{ t('settings.groups.name') }}</label>
        <input
          id="default-participant-name"
          v-model="defaultName"
          class="field-input mt-2"
          type="text"
          autocomplete="name"
          maxlength="100"
          :disabled="savingSettings"
          @change="saveDefaultName"
        >
        <p class="mt-2 text-sm text-gray-600">{{ t('settings.groups.nameHint') }}</p>
        <label class="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg">
          <input
            :checked="visibleDefault"
            type="checkbox"
            class="size-5 shrink-0 accent-brand-600"
            :disabled="savingSettings"
            @change="changeDefault"
          >
          <span class="font-medium">{{ defaultName.trim() ? t('settings.groups.addNamed', { name: defaultName.trim() }) : t('settings.groups.add') }}</span>
        </label>
        <p class="mt-3 text-sm text-gray-600">
          {{ t('settings.groups.note') }}
        </p>
        <p v-if="defaultPersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ defaultPersistenceError }}
        </p>
        <p v-if="defaultNamePersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ defaultNamePersistenceError }}
        </p>
      </section>
      <section class="card mt-5 p-5" aria-labelledby="settlement-defaults">
        <h2 id="settlement-defaults" class="text-lg font-semibold">{{ t('settings.strategy.title') }}</h2>
        <label for="settlement-strategy" class="mt-4 block font-medium">{{ t('settings.strategy.label') }}</label>
        <select id="settlement-strategy" class="field-input mt-2" :value="visibleStrategy" :disabled="savingSettings" @change="changeSettlementStrategy">
          <option value="deterministic">{{ t('settings.strategy.deterministic') }}</option>
          <option value="minimum-transfer">{{ t('settings.strategy.minimum') }}</option>
        </select>
        <p class="mt-3 text-sm text-gray-600">{{ t('settings.strategy.note') }}</p>
        <p v-if="strategyPersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ strategyPersistenceError }}
        </p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="settlement-recording">
        <h2 id="settlement-recording" class="text-lg font-semibold">{{ t('settings.recording.title') }}</h2>
        <p class="mt-2 text-sm text-gray-600">
          {{ t('settings.recording.copy') }}
        </p>
        <label class="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg">
          <input
            :checked="visibleSettlementRecording"
            type="checkbox"
            class="size-5 shrink-0 accent-brand-600"
            :disabled="savingSettings"
            @change="changeSettlementRecording"
          >
          <span class="font-medium">{{ t('settings.recording.label') }}</span>
        </label>
        <p class="mt-3 text-sm text-gray-600">
          {{ t('settings.recording.note') }}
        </p>
        <p v-if="settlementRecordingPersistenceError" class="error-text mt-3 text-sm" role="alert">
          {{ settlementRecordingPersistenceError }}
        </p>
      </section>

      <section id="local-reset" class="card mt-5 border-red-200 p-5" aria-labelledby="local-reset-title">
        <h2 id="local-reset-title" class="text-lg font-semibold">{{ t('settings.reset.title') }}</h2>
        <p class="mt-3 text-sm text-gray-700">{{ t('settings.reset.copy') }}</p>
        <button ref="resetTrigger" type="button" class="danger-button mt-4 w-full" @click="openResetDialog">
          <AppIcon name="trash" />
          {{ t('settings.reset.title') }}
        </button>
      </section>

      <NuxtLink to="/demo" class="secondary-link mt-5 -ml-4"><AppIcon name="info" />{{ t('settings.demo') }}</NuxtLink>

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
