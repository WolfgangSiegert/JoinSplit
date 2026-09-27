<script setup lang="ts">
import { resetAccountPassword } from '~/services/account'

definePageMeta({ path: '/account/reset' })

const route = useRoute()
const config = useRuntimeConfig()
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const password = ref('')
const busy = ref(false)
const error = ref('')
const completed = ref(false)

async function submit(): Promise<void> {
  if (busy.value || !token.value) return
  busy.value = true
  error.value = ''
  try {
    await resetAccountPassword(config.public.apiBase, email.value, token.value, password.value)
    completed.value = true
    password.value = ''
  } catch {
    error.value = 'Der Link ist ungültig oder abgelaufen. Fordere einen neuen Link an.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <NuxtLink to="/account" class="secondary-link -ml-4 mb-3"><AppIcon name="arrow-left" />Account</NuxtLink>
      <header><p class="eyebrow">Account-Zugang</p><h1 class="text-3xl font-semibold text-brand-900">Neues Passwort</h1></header>
      <section class="card mt-6 p-5">
        <template v-if="completed">
          <p role="status">Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.</p>
          <NuxtLink to="/account" class="primary-button mt-4 w-full"><AppIcon name="user" />Zur Anmeldung</NuxtLink>
        </template>
        <form v-else class="space-y-4" @submit.prevent="submit">
          <p v-if="!token" class="error-text" role="alert">Der Reset-Link enthält kein gültiges Token.</p>
          <label class="block font-medium">E-Mail<input v-model="email" class="field-input mt-2" type="email" autocomplete="email" required></label>
          <label class="block font-medium">Neues Passwort<input v-model="password" class="field-input mt-2" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
          <p class="text-sm text-gray-600">Mindestens 12 Zeichen.</p>
          <p v-if="error" class="error-text" role="alert">{{ error }}</p>
          <button class="primary-button w-full" type="submit" :disabled="busy || !token"><AppIcon name="save" />{{ busy ? 'Wird gespeichert …' : 'Passwort speichern' }}</button>
        </form>
      </section>
    </div>
  </main>
</template>
