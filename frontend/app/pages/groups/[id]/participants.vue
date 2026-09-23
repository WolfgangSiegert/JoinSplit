<script setup lang="ts">
const route = useRoute()
const groupsStore = useGroupsStore()
const { add, rename, deactivate, remove } = useParticipants()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const { syncState, visibleState, attemptSync } = useCreateGroupSync(groupId)
const addName = ref('')
const addError = ref('')
const status = ref('')
const statusIsError = ref(false)
const addInput = ref<HTMLInputElement | null>(null)
const editingId = ref<string | null>(null)
const editName = ref('')
const editError = ref('')
const deleteTargetId = ref<string | null>(null)
const deleteDialog = ref<HTMLDialogElement | null>(null)
const deleteButton = ref<HTMLButtonElement | null>(null)
const triggerByParticipant = new Map<string, HTMLButtonElement>()
const renameTriggerByParticipant = new Map<string, HTMLButtonElement>()
const deleteTarget = computed(() => participants.value.find(item => item.id === deleteTargetId.value))
const syncMessage = computed(() => {
  if (visibleState.value === 'offline') return 'Offline. Änderungen bleiben lokal gespeichert.'
  if (visibleState.value === 'syncing') return 'Änderungen werden synchronisiert.'
  if (visibleState.value === 'failed') return syncState.value?.error?.message ?? 'Synchronisierung fehlgeschlagen.'
  if (visibleState.value === 'pending') return 'Synchronisierung ausstehend.'
  return ''
})

async function submitAdd() {
  addError.value = ''; status.value = ''; statusIsError.value = false
  try {
    const result = await add(groupId.value, addName.value)
    if (!result.ok) { addError.value = result.errors.name ?? ''; await nextTick(); addInput.value?.focus(); return }
    addName.value = ''; status.value = `Teilnehmer „${result.value.participant.name}“ wurde lokal hinzugefügt.`
    await nextTick(); addInput.value?.focus()
  } catch { status.value = 'Der Teilnehmer konnte nicht lokal gespeichert werden.'; statusIsError.value = true }
}

function startRename(id: string, name: string) { editingId.value = id; editName.value = name; editError.value = ''; status.value = ''; statusIsError.value = false }
async function submitRename(id: string) {
  editError.value = ''; statusIsError.value = false
  try {
    const result = await rename(id, editName.value)
    if (!result.ok) { editError.value = result.errors.name ?? ''; return }
    editingId.value = null; status.value = `Teilnehmer wurde in „${result.value.participant.name}“ umbenannt.`
    await nextTick(); renameTriggerByParticipant.get(id)?.focus()
  } catch { status.value = 'Die Umbenennung konnte nicht lokal gespeichert werden.'; statusIsError.value = true }
}
async function submitDeactivate(id: string, name: string) {
  statusIsError.value = false
  try { await deactivate(id); status.value = `Teilnehmer „${name}“ wurde deaktiviert.` }
  catch { status.value = 'Die Deaktivierung konnte nicht lokal gespeichert werden.'; statusIsError.value = true }
}
function askDelete(id: string, trigger: HTMLButtonElement) {
  deleteTargetId.value = id; triggerByParticipant.set(id, trigger); deleteDialog.value?.showModal(); nextTick(() => deleteButton.value?.focus())
}
function closeDelete() { const id = deleteTargetId.value; deleteDialog.value?.close(); deleteTargetId.value = null; if (id) triggerByParticipant.get(id)?.focus() }
async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  statusIsError.value = false
  const nextFocus = participants.value.find(item => item.id !== target.id)?.id
  try {
    await remove(target.id); deleteDialog.value?.close(); deleteTargetId.value = null
    status.value = `Teilnehmer „${target.name}“ wurde gelöscht.`
    await nextTick()
    if (nextFocus) triggerByParticipant.get(nextFocus)?.focus(); else addInput.value?.focus()
  } catch { status.value = 'Der Teilnehmer konnte nicht lokal gelöscht werden.'; statusIsError.value = true; closeDelete() }
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink :to="`/groups/${group.id}`" class="secondary-link -ml-4 mb-3">← Gruppe</NuxtLink>
      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">{{ group.name }}</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Teilnehmer</h1>
      </header>

      <form class="card mt-6 p-5" @submit.prevent="submitAdd">
        <label for="participant-name" class="font-semibold">Teilnehmer hinzufügen</label>
        <input id="participant-name" ref="addInput" v-model="addName" class="field-input mt-2" :aria-invalid="Boolean(addError)" :aria-describedby="addError ? 'add-error' : undefined">
        <p v-if="addError" id="add-error" class="error-text mt-2">{{ addError }}</p>
        <button type="submit" class="primary-button mt-3 w-full">Hinzufügen</button>
      </form>

      <p v-if="statusIsError" class="error-text mt-4" role="alert">{{ status }}</p>
      <p v-else class="sr-only" role="status" aria-live="polite">{{ status }}</p>
      <div v-if="syncMessage" class="mt-4 rounded-lg bg-amber-50 p-3 text-amber-950" role="status" aria-live="polite">
        <p>{{ syncMessage }}</p>
        <button v-if="visibleState === 'failed' && syncState?.error?.retryable" type="button" class="secondary-button mt-3" @click="attemptSync">Synchronisierung erneut versuchen</button>
      </div>
      <p v-if="!participants.length" class="card mt-6 p-5 text-center">Noch keine Teilnehmer.</p>
      <ul v-else class="mt-6 space-y-3" aria-label="Teilnehmerliste">
        <li v-for="participant in participants" :key="participant.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div><p class="font-semibold">{{ participant.name }}</p><p class="text-sm text-gray-600">{{ participant.status === 'active' ? 'Aktiv' : 'Inaktiv' }}</p></div>
          </div>
          <form v-if="editingId === participant.id" class="mt-3" @submit.prevent="submitRename(participant.id)">
            <label :for="`rename-${participant.id}`" class="font-semibold">Neuer Name</label>
            <input :id="`rename-${participant.id}`" v-model="editName" class="field-input mt-2" :aria-invalid="Boolean(editError)" :aria-describedby="editError ? `rename-${participant.id}-error` : undefined">
            <p v-if="editError" :id="`rename-${participant.id}-error`" class="error-text mt-2">{{ editError }}</p>
            <div class="mt-3 flex gap-2"><button class="primary-button" type="submit">Speichern</button><button class="secondary-button" type="button" @click="editingId = null">Abbrechen</button></div>
          </form>
          <div v-else class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button :ref="(element) => { if (element) renameTriggerByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="secondary-button" :aria-label="`${participant.name} umbenennen`" @click="startRename(participant.id, participant.name)">Umbenennen</button>
            <button v-if="participant.status === 'active'" type="button" class="secondary-button" :aria-label="`${participant.name} deaktivieren`" @click="submitDeactivate(participant.id, participant.name)">Deaktivieren</button>
            <button :ref="(element) => { if (element) triggerByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="danger-button" :aria-label="`${participant.name} löschen`" @click="askDelete(participant.id, $event.currentTarget as HTMLButtonElement)">Löschen</button>
          </div>
        </li>
      </ul>

      <dialog ref="deleteDialog" aria-labelledby="delete-title" class="delete-dialog rounded-2xl p-0" @cancel.prevent="closeDelete">
        <div class="p-5">
          <h2 id="delete-title" class="text-xl font-semibold">Teilnehmer löschen</h2>
          <p class="mt-3">Teilnehmer „{{ deleteTarget?.name }}“ wirklich löschen?</p>
          <div class="mt-5 flex gap-2"><button type="button" class="secondary-button" @click="closeDelete">Abbrechen</button><button ref="deleteButton" type="button" class="danger-button" @click="confirmDelete">Endgültig löschen</button></div>
        </div>
      </dialog>
    </div>
    <div v-else class="page-content"><h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1></div>
  </main>
</template>
