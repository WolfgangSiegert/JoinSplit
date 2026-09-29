<script setup lang="ts">
const pwa = usePWA()
const installing = ref(false)
const installFeedback = ref('')
const installError = ref('')
const { t } = useAppI18n()

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
      ? t('pwa.install.accepted')
      : t('pwa.install.dismissed')
  } catch {
    installError.value = t('pwa.install.failed')
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
        <h2 id="app-installation-title" class="text-lg font-semibold">{{ t('pwa.install.title') }}</h2>
        <p v-if="installed" class="mt-2 text-sm text-gray-600">
          {{ t('pwa.install.installed') }}
        </p>
        <p v-else-if="canInstall" class="mt-2 text-sm text-gray-600">
          {{ t('pwa.install.available') }}
        </p>
        <p v-else class="mt-2 text-sm text-gray-600">
          {{ t('pwa.install.unavailable') }}
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
      {{ installing ? t('pwa.install.pending') : t('pwa.install.action') }}
    </button>
    <p v-if="installFeedback" class="mt-3 text-sm text-gray-700" role="status">{{ installFeedback }}</p>
    <p v-if="installError" class="error-text mt-3 text-sm" role="alert">{{ installError }}</p>
  </section>
</template>
