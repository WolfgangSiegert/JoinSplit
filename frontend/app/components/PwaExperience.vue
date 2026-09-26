<script setup lang="ts">
import { canApplyPwaUpdate, pendingMutationLabel, pendingMutationVerb } from '~/utils/pwa-update'

const props = defineProps<{
  synchronizePending: () => Promise<void>
}>()

const pwa = usePWA()
const groupsStore = useGroupsStore()
const updateDialog = ref<HTMLDialogElement | null>(null)
const updateTrigger = ref<HTMLButtonElement | null>(null)
const synchronizeButton = ref<HTMLButtonElement | null>(null)
const applyUpdateButton = ref<HTMLButtonElement | null>(null)
const riskCheckbox = ref<HTMLInputElement | null>(null)
const applyingUpdate = ref(false)
const synchronizing = ref(false)
const riskAccepted = ref(false)
const updateError = ref('')
const syncFeedback = ref('')
const installFeedback = ref('')
const installError = ref('')
let updateActivationTimeout: number | undefined

const pendingCount = computed(() => groupsStore.pendingMutations.length)
const canInstall = computed(() => Boolean(pwa?.showInstallPrompt) && !pwa?.isPWAInstalled)
const updateAvailable = computed(() => Boolean(pwa?.needRefresh))
const registrationFailed = computed(() => Boolean(pwa?.registrationError))

async function install(): Promise<void> {
  if (!pwa || !canInstall.value) return
  installFeedback.value = ''
  installError.value = ''
  try {
    const choice = await pwa.install()
    installFeedback.value = choice?.outcome === 'accepted'
      ? 'Installationsanfrage bestätigt. Der Browser schließt die Einrichtung ab.'
      : 'Installation wurde nicht durchgeführt.'
  } catch {
    installError.value = 'Der Installationsdialog konnte nicht geöffnet werden.'
  }
}

function dismissInstall(): void {
  pwa?.cancelInstall()
}

async function requestUpdate(): Promise<void> {
  updateError.value = ''
  syncFeedback.value = ''
  riskAccepted.value = false
  if (pendingCount.value === 0) {
    await applyUpdate()
    return
  }
  updateDialog.value?.showModal()
  await nextTick()
  synchronizeButton.value?.focus()
}

function closeUpdateDialog(): void {
  if (applyingUpdate.value || synchronizing.value) return
  updateDialog.value?.close()
  updateTrigger.value?.focus()
}

async function continueCurrentVersion(): Promise<void> {
  if (!pwa || applyingUpdate.value || synchronizing.value) return
  await pwa.cancelPrompt()
  updateDialog.value?.close()
  updateTrigger.value?.focus()
}

async function synchronizeBeforeUpdate(): Promise<void> {
  if (synchronizing.value || applyingUpdate.value) return
  synchronizing.value = true
  syncFeedback.value = ''
  updateError.value = ''
  try {
    await props.synchronizePending()
    syncFeedback.value = pendingCount.value === 0
      ? 'Alle lokalen Änderungen sind synchronisiert. Die Aktualisierung kann sicher angewendet werden.'
      : `${pendingMutationLabel(pendingCount.value)} ${pendingMutationVerb(pendingCount.value, 'bleibt', 'bleiben')} ausstehend. Du kannst die aktuelle Version weiter nutzen oder das lokale Risiko ausdrücklich akzeptieren.`
  } catch {
    updateError.value = 'Die Synchronisierung konnte nicht abgeschlossen werden. Deine lokalen Änderungen bleiben erhalten.'
  } finally {
    synchronizing.value = false
    await nextTick()
    if (pendingCount.value === 0) applyUpdateButton.value?.focus()
    else riskCheckbox.value?.focus()
  }
}

async function applyUpdate(): Promise<void> {
  if (!pwa || applyingUpdate.value) return
  if (!canApplyPwaUpdate(pendingCount.value, riskAccepted.value)) return
  applyingUpdate.value = true
  updateError.value = ''
  try {
    await pwa.updateServiceWorker(true)
    pwa.getSWRegistration()?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    window.clearTimeout(updateActivationTimeout)
    updateActivationTimeout = window.setTimeout(() => {
      applyingUpdate.value = false
      updateError.value = 'Die neue Version reagiert noch nicht. Die aktuelle Version und deine lokalen Daten bleiben erhalten; du kannst es erneut versuchen.'
      void nextTick(() => applyUpdateButton.value?.focus())
    }, 8_000)
  } catch {
    applyingUpdate.value = false
    updateError.value = 'Die neue Version konnte nicht aktiviert werden. Die aktuelle Version und deine lokalen Daten bleiben erhalten.'
    await nextTick()
    applyUpdateButton.value?.focus()
  }
}

function reloadForRecovery(): void {
  window.location.reload()
}

onUnmounted(() => window.clearTimeout(updateActivationTimeout))
</script>

<template>
  <div class="pwa-notice-stack" aria-live="polite">
    <section v-if="canInstall" class="pwa-notice" aria-labelledby="pwa-install-title">
      <div>
        <h2 id="pwa-install-title" class="font-semibold">JoinSplit als App installieren</h2>
        <p class="mt-1 text-sm text-gray-600">Schneller öffnen und bereits geladene Ansichten offline starten.</p>
      </div>
      <div class="pwa-notice__actions">
        <button type="button" class="primary-button" @click="install"><AppIcon name="download" />Installieren</button>
        <button type="button" class="secondary-button" @click="dismissInstall">Nicht jetzt</button>
      </div>
    </section>

    <section v-if="updateAvailable" class="pwa-notice" aria-labelledby="pwa-update-title">
      <div>
        <h2 id="pwa-update-title" class="font-semibold">Neue JoinSplit-Version verfügbar</h2>
        <p class="mt-1 text-sm text-gray-600">
          Die Aktualisierung startet nur auf deine ausdrückliche Auswahl.
          <template v-if="pendingCount"> {{ pendingMutationLabel(pendingCount) }} {{ pendingMutationVerb(pendingCount, 'ist', 'sind') }} noch nicht synchronisiert.</template>
        </p>
      </div>
      <div class="pwa-notice__actions">
        <button ref="updateTrigger" type="button" class="primary-button" @click="requestUpdate">
          <AppIcon name="refresh" />{{ pendingCount ? 'Aktualisierung prüfen' : 'Jetzt aktualisieren' }}
        </button>
        <button type="button" class="secondary-button" @click="continueCurrentVersion">Später</button>
      </div>
    </section>

    <section v-if="registrationFailed" class="pwa-notice pwa-notice--error" role="alert" aria-labelledby="pwa-error-title">
      <div>
        <h2 id="pwa-error-title" class="font-semibold">Offline-Funktion konnte nicht vorbereitet werden</h2>
        <p class="mt-1 text-sm">Die Website bleibt nutzbar. Lade sie bei stabiler Verbindung erneut.</p>
      </div>
      <button type="button" class="secondary-button" @click="reloadForRecovery"><AppIcon name="refresh" />Neu laden</button>
    </section>

    <p v-if="installFeedback" class="pwa-feedback" role="status">{{ installFeedback }}</p>
    <p v-if="installError" class="pwa-feedback pwa-feedback--error" role="alert">{{ installError }}</p>
    <p v-if="updateError && !updateDialog?.open" class="pwa-feedback pwa-feedback--error" role="alert">{{ updateError }}</p>
  </div>

  <dialog
    ref="updateDialog"
    class="delete-dialog rounded-2xl p-0"
    aria-labelledby="pwa-update-dialog-title"
    aria-describedby="pwa-update-dialog-description"
    :aria-busy="applyingUpdate || synchronizing"
    @cancel.prevent="closeUpdateDialog"
  >
    <div class="p-5">
      <h2 id="pwa-update-dialog-title" class="text-xl font-semibold">JoinSplit sicher aktualisieren?</h2>
      <div id="pwa-update-dialog-description" class="mt-3 space-y-3">
        <p v-if="pendingCount > 0">
          {{ pendingMutationLabel(pendingCount) }} {{ pendingMutationVerb(pendingCount, 'ist', 'sind') }} noch nicht auf dem Server bestätigt. Die Aktualisierung
          löscht IndexedDB nicht, ein unterbrochener Browserprozess kann aber die ausstehende Arbeit verzögern.
        </p>
        <p v-if="pendingCount > 0">Du kannst zuerst synchronisieren oder mit der aktuellen Version weiterarbeiten.</p>
        <p v-else>Alle lokalen Änderungen sind synchronisiert. Die Aktualisierung kann jetzt angewendet werden.</p>
      </div>

      <p v-if="syncFeedback" class="mt-3 text-sm text-gray-700" role="status">{{ syncFeedback }}</p>
      <p v-if="updateError" class="error-text mt-3 text-sm" role="alert">{{ updateError }}</p>

      <label v-if="pendingCount > 0" class="mt-4 flex min-h-11 items-start gap-3 rounded-lg">
        <input ref="riskCheckbox" v-model="riskAccepted" type="checkbox" class="mt-1 size-5 shrink-0 accent-brand-600">
        <span>Ich akzeptiere, dass {{ pendingMutationLabel(pendingCount) }} noch {{ pendingMutationVerb(pendingCount, 'ausstehend ist', 'ausstehend sind') }}, und möchte jetzt aktualisieren.</span>
      </label>

      <div class="mt-5 grid gap-2 sm:grid-cols-2">
        <button v-if="pendingCount > 0" ref="synchronizeButton" type="button" class="secondary-button" :disabled="synchronizing || applyingUpdate" @click="synchronizeBeforeUpdate">
          <AppIcon name="refresh" />{{ synchronizing ? 'Synchronisierung läuft …' : 'Zuerst synchronisieren' }}
        </button>
        <button type="button" class="secondary-button" :class="{ 'sm:col-span-2': pendingCount === 0 }" :disabled="synchronizing || applyingUpdate" @click="continueCurrentVersion">
          Aktuelle Version nutzen
        </button>
        <button
          ref="applyUpdateButton"
          type="button"
          class="primary-button sm:col-span-2"
          :disabled="applyingUpdate || synchronizing || (pendingCount > 0 && !riskAccepted)"
          @click="applyUpdate"
        >
          <AppIcon name="refresh" />{{ applyingUpdate ? 'Aktualisierung wird aktiviert …' : pendingCount > 0 ? 'Risiko akzeptieren und aktualisieren' : 'Jetzt aktualisieren' }}
        </button>
      </div>
    </div>
  </dialog>
</template>
