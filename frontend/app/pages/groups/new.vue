<script setup lang="ts">
import type { CreateGroupErrors } from '~/domain/create-group'

const settingsStore = useSettingsStore()
const { createGroup } = useCreateGroup()
const groupName = ref('')
const addParticipant = ref(settingsStore.addSelfAsParticipantByDefault)
const participantName = ref('')
const errors = ref<CreateGroupErrors>({})
const localError = ref('')
const submitting = ref(false)
const groupNameInput = ref<HTMLInputElement | null>(null)
const participantNameInput = ref<HTMLInputElement | null>(null)

async function focusFirstError(): Promise<void> {
  await nextTick()
  if (errors.value.groupName) {
    groupNameInput.value?.focus()
  } else if (errors.value.participantName) {
    participantNameInput.value?.focus()
  }
}

async function submit(): Promise<void> {
  if (submitting.value) return

  errors.value = {}
  localError.value = ''
  submitting.value = true

  let result: Awaited<ReturnType<typeof createGroup>>

  try {
    result = await createGroup({
      groupName: groupName.value,
      addParticipant: addParticipant.value,
      participantName: participantName.value,
    })
  } catch {
    localError.value = 'Die Gruppe konnte lokal nicht gespeichert werden. Deine Eingaben sind erhalten.'
    submitting.value = false
    return
  }

  if (!result.ok) {
    errors.value = result.errors
    submitting.value = false
    await focusFirstError()
    return
  }

  await navigateTo(`/groups/${result.groupId}?created=1`)
}
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3"><AppIcon name="arrow-left" />Gruppen</NuxtLink>

      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">Neue Gruppe</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Gruppe erstellen</h1>
        <p class="mt-2 text-gray-600">Die Gruppe steht direkt auf diesem Gerät bereit.</p>
      </header>

      <PublicDemoNotice class="mt-7" />

      <form class="card mt-7 space-y-6 p-5" novalidate @submit.prevent="submit">
        <div>
          <label for="group-name" class="mb-2 block font-semibold">Gruppenname</label>
          <input
            id="group-name"
            ref="groupNameInput"
            v-model="groupName"
            class="field-input"
            type="text"
            autocomplete="off"
            required
            :aria-invalid="Boolean(errors.groupName)"
            :aria-describedby="errors.groupName ? 'group-name-error' : 'group-name-hint'"
          >
          <p id="group-name-hint" class="mt-2 text-sm text-gray-600">1 bis 100 Zeichen</p>
          <p v-if="errors.groupName" id="group-name-error" class="error-text mt-2 text-sm" role="alert">
            {{ errors.groupName }}
          </p>
        </div>

        <div>
          <span class="mb-2 block font-semibold">Währung</span>
          <p class="min-h-11 rounded-lg bg-gray-100 px-3 py-2.5">EUR</p>
          <p class="mt-2 text-sm text-gray-600">Für neue Gruppen fest vorgegeben.</p>
        </div>

        <div>
          <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg">
            <input
              v-model="addParticipant"
              type="checkbox"
              class="size-5 shrink-0 accent-brand-600"
              :aria-controls="addParticipant ? 'participant-field' : undefined"
              :aria-expanded="addParticipant"
            >
            <span class="font-medium">Mich als Teilnehmer hinzufügen</span>
          </label>

          <div v-if="addParticipant" id="participant-field" class="mt-4">
            <label for="participant-name" class="mb-2 block font-semibold">
              Mein Name in dieser Gruppe
            </label>
            <input
              id="participant-name"
              ref="participantNameInput"
              v-model="participantName"
              class="field-input"
              type="text"
              autocomplete="name"
              required
              :aria-invalid="Boolean(errors.participantName)"
              :aria-describedby="errors.participantName ? 'participant-name-error' : undefined"
            >
            <p
              v-if="errors.participantName"
              id="participant-name-error"
              class="error-text mt-2 text-sm"
              role="alert"
            >
              {{ errors.participantName }}
            </p>
          </div>
        </div>

        <p v-if="localError" class="error-text rounded-lg bg-red-50 p-3 text-sm" role="alert">
          {{ localError }}
        </p>

        <button type="submit" class="primary-button w-full" :disabled="submitting">
          <AppIcon name="plus" />
          {{ submitting ? 'Wird lokal erstellt …' : 'Gruppe erstellen' }}
        </button>
      </form>
    </div>
  </main>
</template>
