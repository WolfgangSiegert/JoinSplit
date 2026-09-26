<script setup lang="ts">
import { normalizeName } from '../../../domain/create-group'
import { participantHasFinancialReferences } from '../../../domain/expense'
import { participantHasSettlementReferences } from '../../../domain/settlement'
import { hasDuplicateParticipantName } from '../../../domain/participant'

const route = useRoute()
const groupsStore = useGroupsStore()
const { add, rename, deactivate, remove } = useParticipants()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
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
const duplicateRenameConfirmByParticipant = new Map<string, HTMLButtonElement>()
const deleteTarget = computed(() => participants.value.find(item => item.id === deleteTargetId.value))
const busyAction = ref<string | null>(null)
const duplicateWarning = ref<{ kind: 'add' | 'rename'; participantId?: string; name: string } | null>(null)
const duplicateConfirmButton = ref<HTMLButtonElement | null>(null)

function hasFinancialReferences(participantId: string): boolean {
  return participantHasFinancialReferences(participantId, groupsStore.expenses)
    || participantHasSettlementReferences(participantId, groupsStore.settlements)
}

watch(addName, () => {
  if (duplicateWarning.value?.kind === 'add') duplicateWarning.value = null
})
watch(editName, () => {
  if (duplicateWarning.value?.kind === 'rename') duplicateWarning.value = null
})

async function submitAdd(duplicateConfirmed = false) {
  if (busyAction.value) return
  addError.value = ''; status.value = ''; statusIsError.value = false
  if (!duplicateConfirmed && hasDuplicateParticipantName(participants.value, addName.value)) {
    duplicateWarning.value = { kind: 'add', name: normalizeName(addName.value) }
    await nextTick(); duplicateConfirmButton.value?.focus()
    return
  }
  duplicateWarning.value = null
  busyAction.value = 'add'
  let restoreAddFocus = false
  try {
    const result = await add(groupId.value, addName.value)
    if (!result.ok) { addError.value = result.errors.name ?? ''; restoreAddFocus = true; return }
    addName.value = ''; status.value = `Teilnehmer „${result.value.participant.name}“ wurde lokal hinzugefügt.`
    restoreAddFocus = true
  } catch { status.value = 'Der Teilnehmer konnte nicht lokal gespeichert werden.'; statusIsError.value = true; restoreAddFocus = true }
  finally {
    busyAction.value = null
    if (restoreAddFocus) { await nextTick(); addInput.value?.focus() }
  }
}

function startRename(id: string, name: string) { editingId.value = id; editName.value = name; editError.value = ''; status.value = ''; statusIsError.value = false }
async function submitRename(id: string, duplicateConfirmed = false) {
  if (busyAction.value) return
  editError.value = ''; statusIsError.value = false
  if (!duplicateConfirmed && hasDuplicateParticipantName(participants.value, editName.value, id)) {
    duplicateWarning.value = { kind: 'rename', participantId: id, name: normalizeName(editName.value) }
    await nextTick(); duplicateRenameConfirmByParticipant.get(id)?.focus()
    return
  }
  duplicateWarning.value = null
  busyAction.value = `rename:${id}`
  try {
    const result = await rename(id, editName.value)
    if (!result.ok) { editError.value = result.errors.name ?? ''; return }
    editingId.value = null; status.value = `Teilnehmer wurde in „${result.value.participant.name}“ umbenannt.`
    busyAction.value = null
    await nextTick(); renameTriggerByParticipant.get(id)?.focus()
  } catch { status.value = 'Die Umbenennung konnte nicht lokal gespeichert werden.'; statusIsError.value = true }
  finally { busyAction.value = null }
}
async function submitDeactivate(id: string, name: string) {
  if (busyAction.value) return
  busyAction.value = `deactivate:${id}`
  statusIsError.value = false
  try { await deactivate(id); status.value = `Teilnehmer „${name}“ wurde deaktiviert.` }
  catch { status.value = 'Die Deaktivierung konnte nicht lokal gespeichert werden.'; statusIsError.value = true }
  finally { busyAction.value = null }
}
function askDelete(id: string, trigger: HTMLButtonElement) {
  if (busyAction.value || hasFinancialReferences(id)) return
  deleteTargetId.value = id; triggerByParticipant.set(id, trigger); deleteDialog.value?.showModal(); nextTick(() => deleteButton.value?.focus())
}
function closeDelete() { const id = deleteTargetId.value; deleteDialog.value?.close(); deleteTargetId.value = null; if (id) triggerByParticipant.get(id)?.focus() }
async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || busyAction.value) return
  busyAction.value = `delete:${target.id}`
  statusIsError.value = false
  const nextFocus = participants.value.find(item => item.id !== target.id)?.id
  try {
    await remove(target.id); deleteDialog.value?.close(); deleteTargetId.value = null
    status.value = `Teilnehmer „${target.name}“ wurde gelöscht.`
    busyAction.value = null
    await nextTick()
    const nextDeleteTrigger = nextFocus ? triggerByParticipant.get(nextFocus) : undefined
    if (nextDeleteTrigger) nextDeleteTrigger.focus(); else addInput.value?.focus()
  } catch { status.value = 'Der Teilnehmer konnte nicht lokal gelöscht werden.'; statusIsError.value = true; busyAction.value = null; closeDelete() }
  finally { busyAction.value = null }
}

async function cancelRename(id: string): Promise<void> {
  editingId.value = null
  duplicateWarning.value = null
  await nextTick()
  renameTriggerByParticipant.get(id)?.focus()
}
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink :to="`/groups/${group.id}`" class="secondary-link -ml-4 mb-3"><AppIcon name="arrow-left" />Gruppe</NuxtLink>
      <header>
        <p class="eyebrow">{{ group.name }}</p>
        <h1 class="mt-2 text-4xl font-bold text-brand-900">Personen</h1>
        <p class="mt-2 text-ink-700">Identitäten bleiben über Ausgaben und Salden hinweg klar erkennbar.</p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <GroupSyncStatus :group-id="group.id" class="mt-6" />

      <p v-if="group.status === 'archived'" class="card mt-6 p-4">
        Diese archivierte Gruppe ist schreibgeschützt. Teilnehmer können nur angesehen werden.
      </p>

      <form v-if="group.status === 'active'" class="card mt-6 p-5" :aria-busy="busyAction === 'add'" @submit.prevent="submitAdd()">
        <label for="participant-name" class="font-semibold">Teilnehmer hinzufügen</label>
        <input id="participant-name" ref="addInput" v-model="addName" class="field-input mt-2" :disabled="Boolean(busyAction)" :aria-invalid="Boolean(addError)" :aria-describedby="addError ? 'add-error' : undefined">
        <p v-if="addError" id="add-error" class="error-text mt-2">{{ addError }}</p>
        <div v-if="duplicateWarning?.kind === 'add'" class="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950" role="alert">
          <p class="font-semibold">Name bereits vorhanden</p>
          <p class="mt-1">Der Name „{{ duplicateWarning.name }}“ wird in dieser Gruppe bereits verwendet.</p>
          <button ref="duplicateConfirmButton" type="button" class="secondary-button mt-3" :disabled="Boolean(busyAction)" @click="submitAdd(true)">Trotzdem hinzufügen</button>
        </div>
        <button type="submit" class="primary-button mt-3 w-full" :disabled="Boolean(busyAction)"><AppIcon name="plus" />{{ busyAction === 'add' ? 'Wird hinzugefügt …' : 'Hinzufügen' }}</button>
      </form>

      <p v-if="statusIsError" class="error-text mt-4" role="alert">{{ status }}</p>
      <p v-else class="sr-only" role="status" aria-live="polite">{{ status }}</p>
      <p v-if="!participants.length" class="card mt-6 p-5 text-center">Noch keine Teilnehmer.</p>
      <ul v-else class="ledger-list mt-6" aria-label="Teilnehmerliste" :aria-busy="Boolean(busyAction)">
        <li v-for="(participant, index) in participants" :key="participant.id" class="py-4">
          <div class="flex items-center gap-3">
            <ParticipantAvatar :name="participant.name" :index="index" size="lg" />
            <div><p class="font-bold">{{ participant.name }}</p><p class="text-sm text-ink-700">{{ participant.status === 'active' ? 'Aktiv' : 'Inaktiv' }}</p></div>
          </div>
          <form v-if="group.status === 'active' && editingId === participant.id" class="mt-3" :aria-busy="busyAction === `rename:${participant.id}`" @submit.prevent="submitRename(participant.id)">
            <label :for="`rename-${participant.id}`" class="font-semibold">Neuer Name</label>
            <input :id="`rename-${participant.id}`" v-model="editName" class="field-input mt-2" :disabled="Boolean(busyAction)" :aria-invalid="Boolean(editError)" :aria-describedby="editError ? `rename-${participant.id}-error` : undefined">
            <p v-if="editError" :id="`rename-${participant.id}-error`" class="error-text mt-2">{{ editError }}</p>
            <div v-if="duplicateWarning?.kind === 'rename' && duplicateWarning.participantId === participant.id" class="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950" role="alert">
              <p class="font-semibold">Name bereits vorhanden</p>
              <p class="mt-1">Der Name „{{ duplicateWarning.name }}“ wird in dieser Gruppe bereits verwendet.</p>
              <button :ref="(element) => { if (element) duplicateRenameConfirmByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="secondary-button mt-3" :disabled="Boolean(busyAction)" @click="submitRename(participant.id, true)">Trotzdem umbenennen</button>
            </div>
            <div class="mt-3 flex gap-2"><button class="primary-button" type="submit" :disabled="Boolean(busyAction)"><AppIcon name="save" />{{ busyAction === `rename:${participant.id}` ? 'Wird gespeichert …' : 'Speichern' }}</button><button class="secondary-button" type="button" :disabled="Boolean(busyAction)" @click="cancelRename(participant.id)">Abbrechen</button></div>
          </form>
          <div v-else-if="group.status === 'active'" class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button :ref="(element) => { if (element) renameTriggerByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="secondary-button" :disabled="Boolean(busyAction)" :aria-label="`${participant.name} umbenennen`" @click="startRename(participant.id, participant.name)"><AppIcon name="pencil" />Umbenennen</button>
            <button v-if="participant.status === 'active'" type="button" class="secondary-button" :disabled="Boolean(busyAction)" :aria-label="`${participant.name} deaktivieren`" @click="submitDeactivate(participant.id, participant.name)"><AppIcon name="user-minus" />{{ busyAction === `deactivate:${participant.id}` ? 'Wird deaktiviert …' : 'Deaktivieren' }}</button>
            <button v-if="!hasFinancialReferences(participant.id)" :ref="(element) => { if (element) triggerByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="danger-button" :disabled="Boolean(busyAction)" :aria-label="`${participant.name} löschen`" @click="askDelete(participant.id, $event.currentTarget as HTMLButtonElement)"><AppIcon name="trash" />Löschen</button>
          </div>
          <p v-if="group.status === 'active' && hasFinancialReferences(participant.id) && participant.status === 'active'" class="mt-3 text-sm text-gray-600">Kann wegen vorhandener Finanzdaten nicht gelöscht werden. Deaktiviere die Person, damit sie für neue Ausgaben nicht mehr auswählbar ist.</p>
          <p v-else-if="group.status === 'active' && hasFinancialReferences(participant.id)" class="mt-3 text-sm text-gray-600">Kann wegen vorhandener Finanzdaten nicht gelöscht werden und bleibt für den finanziellen Verlauf erhalten.</p>
        </li>
      </ul>

      <dialog ref="deleteDialog" aria-labelledby="delete-title" class="delete-dialog rounded-2xl p-0" :aria-busy="busyAction?.startsWith('delete:')" @cancel.prevent="closeDelete">
        <div class="p-5">
          <h2 id="delete-title" class="text-xl font-semibold">Teilnehmer löschen</h2>
          <p class="mt-3">Teilnehmer „{{ deleteTarget?.name }}“ wirklich löschen?</p>
          <div class="mt-5 flex gap-2"><button type="button" class="secondary-button" :disabled="Boolean(busyAction)" @click="closeDelete">Abbrechen</button><button ref="deleteButton" type="button" class="danger-button" :disabled="Boolean(busyAction)" @click="confirmDelete">{{ busyAction?.startsWith('delete:') ? 'Wird gelöscht …' : 'Endgültig löschen' }}</button></div>
        </div>
      </dialog>
    </div>
    <div v-else class="page-content"><h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1></div>
  </main>
</template>
