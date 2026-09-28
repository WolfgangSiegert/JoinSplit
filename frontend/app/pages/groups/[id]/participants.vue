<script setup lang="ts">
import { normalizeName } from '../../../domain/create-group'
import { participantHasFinancialReferences } from '../../../domain/expense'
import { participantHasSettlementReferences } from '../../../domain/settlement'
import { hasDuplicateParticipantName } from '../../../domain/participant'

const route = useRoute()
const groupsStore = useGroupsStore()
const peopleStore = usePeopleStore()
const { add, rename, deactivate, reactivate, associate, remove } = useParticipants()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const participantSearch = ref('')
const filteredParticipants = computed(() => {
  const query = participantSearch.value.trim().toLocaleLowerCase('de-DE')
  if (!query) return participants.value

  return participants.value.filter((participant) => {
    const linkedPersonName = participant.personId
      ? peopleStore.people.find(person => person.id === participant.personId)?.name ?? ''
      : ''
    return `${participant.name} ${linkedPersonName}`.toLocaleLowerCase('de-DE').includes(query)
  })
})
const addName = ref('')
const selectedPersonId = ref('')
const associationSelection = reactive<Record<string, string>>({})
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
const summaryByParticipant = new Map<string, HTMLElement>()
const detailsByParticipant = new Map<string, HTMLDetailsElement>()
const renameInputByParticipant = new Map<string, HTMLInputElement>()
const duplicateRenameConfirmByParticipant = new Map<string, HTMLButtonElement>()
const deleteTarget = computed(() => participants.value.find(item => item.id === deleteTargetId.value))
const busyAction = ref<string | null>(null)
const duplicateWarning = ref<{ kind: 'add' | 'rename'; participantId?: string; name: string } | null>(null)
const duplicateConfirmButton = ref<HTMLButtonElement | null>(null)
const availablePeople = computed(() => {
  const linked = new Set(participants.value.flatMap(participant => participant.personId ? [participant.personId] : []))
  return peopleStore.activePeople.filter(person => !linked.has(person.id))
})

onMounted(async () => {
  if (route.hash !== '#participant-form') return
  await nextTick()
  addInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  addInput.value?.focus()
})

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

async function addSelectedPerson(): Promise<void> {
  if (busyAction.value || !selectedPersonId.value) return
  const person = peopleStore.people.find(item => item.id === selectedPersonId.value && item.status === 'active')
  if (!person) { status.value = 'Die ausgewählte Person ist nicht mehr verfügbar.'; statusIsError.value = true; return }
  busyAction.value = 'add-person'
  status.value = ''
  statusIsError.value = false
  try {
    const result = await add(groupId.value, person.name, person.id)
    if (!result.ok) { status.value = result.errors.name ?? 'Die Person konnte nicht hinzugefügt werden.'; statusIsError.value = true; return }
    selectedPersonId.value = ''
    status.value = `Person „${person.name}“ wurde dieser Gruppe hinzugefügt.`
  } catch {
    status.value = 'Die Person konnte nicht lokal mit dieser Gruppe verknüpft werden.'
    statusIsError.value = true
  } finally {
    busyAction.value = null
  }
}

async function updateAssociation(participantId: string, personId: string | null): Promise<void> {
  if (busyAction.value) return
  busyAction.value = `associate:${participantId}`
  status.value = ''
  statusIsError.value = false
  try {
    const person = personId ? peopleStore.people.find(item => item.id === personId && item.status === 'active') : null
    if (personId && !person) throw new Error('Active Person required')
    await associate(participantId, personId)
    associationSelection[participantId] = ''
    status.value = person
      ? `Teilnehmer wurde ausdrücklich mit „${person.name}“ verknüpft.`
      : 'Die Verknüpfung wurde gelöst. Teilnehmer und Person bleiben erhalten.'
  } catch {
    status.value = 'Die Personenverknüpfung konnte nicht sicher gespeichert werden.'
    statusIsError.value = true
  } finally {
    busyAction.value = null
  }
}

async function startRename(id: string, name: string): Promise<void> {
  editingId.value = id
  editName.value = name
  editError.value = ''
  status.value = ''
  statusIsError.value = false
  const details = detailsByParticipant.get(id)
  if (details) details.open = true
  await nextTick()
  renameInputByParticipant.get(id)?.focus()
}
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
async function submitReactivate(id: string, name: string) {
  if (busyAction.value) return
  busyAction.value = `reactivate:${id}`
  statusIsError.value = false
  try { await reactivate(id); status.value = `Teilnehmer „${name}“ wurde reaktiviert.` }
  catch { status.value = 'Die Reaktivierung konnte nicht lokal gespeichert werden.'; statusIsError.value = true }
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
  const nextFocus = filteredParticipants.value.find(item => item.id !== target.id)?.id
  try {
    await remove(target.id); deleteDialog.value?.close(); deleteTargetId.value = null
    status.value = `Teilnehmer „${target.name}“ wurde gelöscht.`
    busyAction.value = null
    await nextTick()
    const nextSummary = nextFocus ? summaryByParticipant.get(nextFocus) : undefined
    if (nextSummary) nextSummary.focus(); else addInput.value?.focus()
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
      <NuxtLink :to="`/groups/${group.id}`" class="secondary-link -ml-4 mb-3" aria-label="← Gruppe"><AppIcon name="arrow-left" />Gruppe</NuxtLink>
      <header class="group-view-heading">
        <p class="eyebrow">{{ group.name }}</p>
        <div class="group-view-heading__title-row">
          <h1 class="text-4xl font-bold text-brand-900">Personen</h1>
          <GroupSyncStatus :group-id="group.id" mobile-collapsible class="group-view-heading__sync" />
        </div>
        <p class="mt-2 text-ink-700">Wer ist dabei, wer kommt noch dazu?</p>
        <p class="group-view-heading__description mt-2 text-sm text-ink-700">Verwalte alle, die in dieser Gruppe gemeinsam abrechnen.</p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <p v-if="group.status === 'archived'" class="card mt-6 p-4">
        Diese archivierte Gruppe ist schreibgeschützt. Teilnehmer können nur angesehen werden.
      </p>

      <form v-if="group.status === 'active'" id="participant-form" class="card mt-6 scroll-mt-28 p-5" :aria-busy="busyAction === 'add'" @submit.prevent="submitAdd()">
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

      <section v-if="group.status === 'active'" class="card mt-4 p-5" aria-labelledby="add-known-person-title">
        <h2 id="add-known-person-title" class="font-semibold">Person aus dem Verzeichnis hinzufügen</h2>
        <template v-if="peopleStore.activePeople.length">
          <label for="known-person" class="mt-3 block font-medium">Person</label>
          <select id="known-person" v-model="selectedPersonId" class="field-input mt-2" :disabled="Boolean(busyAction) || !availablePeople.length">
            <option value="">Person auswählen</option>
            <option v-for="person in availablePeople" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
          <p v-if="!availablePeople.length" class="mt-2 text-sm text-gray-600">Alle aktiven Personen sind dieser Gruppe bereits zugeordnet.</p>
          <button type="button" class="secondary-button mt-3 w-full" :disabled="Boolean(busyAction) || !selectedPersonId" @click="addSelectedPerson"><AppIcon name="users" />{{ busyAction === 'add-person' ? 'Wird hinzugefügt …' : 'Ausgewählte Person hinzufügen' }}</button>
        </template>
        <p v-else class="mt-2 text-sm text-gray-600">Lege zuerst im globalen Personenverzeichnis eine Person an.</p>
        <NuxtLink to="/people" class="secondary-link mt-3 -ml-4"><AppIcon name="arrow-right" />Personenverzeichnis öffnen</NuxtLink>
      </section>

      <p v-if="statusIsError" class="error-text mt-4" role="alert">{{ status }}</p>
      <p v-else class="sr-only" role="status" aria-live="polite">{{ status }}</p>
      <p v-if="!participants.length" class="card mt-6 p-5 text-center">Noch keine Teilnehmer.</p>
      <section v-else class="participant-list-section mt-6" aria-labelledby="participant-list-title">
        <div class="list-section-heading">
          <div>
            <h2 id="participant-list-title" class="text-2xl font-bold">Teilnehmer</h2>
            <p class="mt-1 text-sm text-ink-700">{{ participants.length }} {{ participants.length === 1 ? 'Person' : 'Personen' }}</p>
          </div>
          <ListSearch v-model="participantSearch" label="Teilnehmer durchsuchen" />
        </div>
        <p v-if="!filteredParticipants.length" class="card mt-4 p-5 text-center">Keine Person passt zu „{{ participantSearch.trim() }}“.</p>
        <ul v-else class="participant-list mt-4" aria-label="Teilnehmerliste" :aria-busy="Boolean(busyAction)">
          <li v-for="participant in filteredParticipants" :key="participant.id" class="participant-list__item">
            <details :ref="(element) => { if (element) detailsByParticipant.set(participant.id, element as HTMLDetailsElement); else detailsByParticipant.delete(participant.id) }" class="participant-entry">
              <summary :ref="(element) => { if (element) summaryByParticipant.set(participant.id, element as HTMLElement); else summaryByParticipant.delete(participant.id) }" class="participant-entry__summary" :aria-label="`Details zu ${participant.name}`">
                <ParticipantAvatar :name="participant.name" :index="participants.findIndex(item => item.id === participant.id)" size="lg" />
                <span class="participant-entry__identity">
                  <strong>{{ participant.name }}</strong>
                  <span>{{ participant.status === 'active' ? 'Aktiv' : 'Inaktiv' }}{{ participant.personId ? ' · Aus Personenverzeichnis' : '' }}</span>
                </span>
                <span class="participant-entry__toggle" aria-hidden="true"><span>Details</span><AppIcon name="chevron-down" /></span>
              </summary>
              <div class="participant-entry__content">
                <form v-if="group.status === 'active' && editingId === participant.id" class="mt-3" :aria-busy="busyAction === `rename:${participant.id}`" @submit.prevent="submitRename(participant.id)">
                  <label :for="`rename-${participant.id}`" class="font-semibold">Neuer Name</label>
                  <input :id="`rename-${participant.id}`" :ref="(element) => { if (element) renameInputByParticipant.set(participant.id, element as HTMLInputElement); else renameInputByParticipant.delete(participant.id) }" v-model="editName" class="field-input mt-2" :disabled="Boolean(busyAction)" :aria-invalid="Boolean(editError)" :aria-describedby="editError ? `rename-${participant.id}-error` : undefined">
                  <p v-if="editError" :id="`rename-${participant.id}-error`" class="error-text mt-2">{{ editError }}</p>
                  <div v-if="duplicateWarning?.kind === 'rename' && duplicateWarning.participantId === participant.id" class="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950" role="alert">
                    <p class="font-semibold">Name bereits vorhanden</p>
                    <p class="mt-1">Der Name „{{ duplicateWarning.name }}“ wird in dieser Gruppe bereits verwendet.</p>
                    <button :ref="(element) => { if (element) duplicateRenameConfirmByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="secondary-button mt-3" :disabled="Boolean(busyAction)" @click="submitRename(participant.id, true)">Trotzdem umbenennen</button>
                  </div>
                  <div class="mt-3 flex gap-2"><button class="primary-button" type="submit" :disabled="Boolean(busyAction)"><AppIcon name="save" />{{ busyAction === `rename:${participant.id}` ? 'Wird gespeichert …' : 'Speichern' }}</button><button class="secondary-button" type="button" :disabled="Boolean(busyAction)" @click="cancelRename(participant.id)">Abbrechen</button></div>
                </form>
                <div v-else-if="group.status === 'active' && !hasFinancialReferences(participant.id)" class="participant-entry__actions mt-3">
                  <button v-if="!hasFinancialReferences(participant.id)" :ref="(element) => { if (element) triggerByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="danger-button" :disabled="Boolean(busyAction)" :aria-label="`${participant.name} löschen`" @click="askDelete(participant.id, $event.currentTarget as HTMLButtonElement)"><AppIcon name="trash" />Löschen</button>
                </div>
                <div v-if="group.status === 'active'" class="mt-3 rounded-xl border border-gray-200 p-3">
                  <template v-if="participant.personId">
                    <p class="text-sm text-ink-700">Mit „{{ peopleStore.people.find(person => person.id === participant.personId)?.name ?? participant.name }}“ im Personenverzeichnis verknüpft.</p>
                    <button type="button" class="secondary-button mt-3 w-full" :disabled="Boolean(busyAction)" :aria-label="`Verknüpfung von ${participant.name} lösen`" @click="updateAssociation(participant.id, null)"><AppIcon name="unlink" />{{ busyAction === `associate:${participant.id}` ? 'Wird gelöst …' : 'Verknüpfung lösen' }}</button>
                  </template>
                  <template v-else-if="availablePeople.length">
                    <label :for="`associate-${participant.id}`" class="block text-sm font-semibold">Bestehende Person verknüpfen</label>
                    <select :id="`associate-${participant.id}`" v-model="associationSelection[participant.id]" class="field-input mt-2" :disabled="Boolean(busyAction)">
                      <option value="">Person auswählen</option>
                      <option v-for="person in availablePeople" :key="person.id" :value="person.id">{{ person.name }}</option>
                    </select>
                    <button type="button" class="secondary-button mt-3 w-full" :disabled="Boolean(busyAction) || !associationSelection[participant.id]" @click="updateAssociation(participant.id, associationSelection[participant.id]!)"><AppIcon name="link" />{{ busyAction === `associate:${participant.id}` ? 'Wird verknüpft …' : 'Ausdrücklich verknüpfen' }}</button>
                  </template>
                  <p v-else class="text-sm text-gray-600">Keine weitere aktive Person zum Verknüpfen verfügbar.</p>
                </div>
                <p v-if="group.status === 'active' && hasFinancialReferences(participant.id) && participant.status === 'active'" class="mt-3 text-sm text-gray-600">Kann wegen vorhandener Finanzdaten nicht gelöscht werden. Deaktiviere die Person, damit sie für neue Ausgaben nicht mehr auswählbar ist.</p>
                <p v-else-if="group.status === 'active' && hasFinancialReferences(participant.id)" class="mt-3 text-sm text-gray-600">Kann wegen vorhandener Finanzdaten nicht gelöscht werden und bleibt für den finanziellen Verlauf erhalten.</p>
              </div>
            </details>
            <div v-if="group.status === 'active'" class="participant-entry__quick-actions" aria-label="Schnellaktionen">
              <button :ref="(element) => { if (element) renameTriggerByParticipant.set(participant.id, element as HTMLButtonElement); else renameTriggerByParticipant.delete(participant.id) }" type="button" class="icon-button participant-entry__quick-action" :disabled="Boolean(busyAction) || editingId === participant.id" :aria-label="`${participant.name} umbenennen`" title="Umbenennen" @click="startRename(participant.id, participant.name)"><AppIcon name="pencil" /></button>
              <button v-if="participant.status === 'active'" type="button" class="icon-button participant-entry__quick-action" :disabled="Boolean(busyAction)" :aria-label="`${participant.name} deaktivieren`" title="Deaktivieren" @click="submitDeactivate(participant.id, participant.name)"><AppIcon name="user-minus" /></button>
              <button v-else type="button" class="icon-button participant-entry__quick-action" :disabled="Boolean(busyAction)" :aria-label="`${participant.name} reaktivieren`" title="Reaktivieren" @click="submitReactivate(participant.id, participant.name)"><AppIcon name="refresh" /></button>
            </div>
          </li>
        </ul>
      </section>

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
