<script setup lang="ts">
const pwa = usePWA()
const installing = ref(false)
const installFeedback = ref('')
const installError = ref('')

const installed = computed(() => Boolean(pwa?.isPWAInstalled))
const canInstall = computed(() => Boolean(pwa?.showInstallPrompt) && !installed.value)

async function install(): Promise<void> {
  if (!pwa || installing.value || !canInstall.value) return
  installing.value = true
  installFeedback.value = ''
  installError.value = ''
  try {
    const choice = await pwa.install()
    installFeedback.value = choice?.outcome === 'accepted'
      ? 'Installationsanfrage bestätigt. Der Browser schließt die Einrichtung ab.'
      : 'Installation wurde nicht durchgeführt.'
  } catch {
    installError.value = 'Der Installationsdialog konnte nicht geöffnet werden.'
  } finally {
    installing.value = false
  }
}
</script>

<template>
  <section class="card p-5" aria-labelledby="app-installation-title">
    <div class="flex items-start gap-3">
      <AppIcon name="download" />
      <div class="min-w-0 flex-1">
        <h2 id="app-installation-title" class="text-lg font-semibold">App-Installation</h2>
        <p v-if="installed" class="mt-2 text-sm text-gray-600">
          JoinSplit läuft als installierte App auf diesem Gerät.
        </p>
        <p v-else-if="canInstall" class="mt-2 text-sm text-gray-600">
          Dieser Browser kann JoinSplit direkt als App installieren.
        </p>
        <p v-else class="mt-2 text-sm text-gray-600">
          Eine direkte Installation ist hier gerade nicht verfügbar. Je nach Browser kannst du im
          Browsermenü „App installieren“ oder „Zum Home-Bildschirm“ wählen. Die Website bleibt
          unabhängig davon vollständig nutzbar.
        </p>
      </div>
    </div>

    <button
      v-if="canInstall"
      type="button"
      class="primary-button mt-4 w-full"
      :disabled="installing"
      @click="install"
    >
      <AppIcon name="download" />
      {{ installing ? 'Installationsdialog wird geöffnet …' : 'JoinSplit installieren' }}
    </button>
    <p v-if="installFeedback" class="mt-3 text-sm text-gray-700" role="status">{{ installFeedback }}</p>
    <p v-if="installError" class="error-text mt-3 text-sm" role="alert">{{ installError }}</p>
  </section>
</template>
