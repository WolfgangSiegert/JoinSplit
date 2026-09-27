<script setup lang="ts">
import { preparePerson, renamePerson, type Person } from '~/domain/person'
import type { PendingPersonMutation } from '~/domain/pending-person-mutation'
import { deletePerson, persistPerson, persistPersonDeleteMutation, persistPersonMutation } from '~/persistence/database'
import { usePeopleStore } from '~/stores/people'

const peopleStore = usePeopleStore()
const groupsStore = useGroupsStore()
const accountStore = useAccountStore()
const name = ref('')
const editingId = ref<string | null>(null)
const error = ref('')
const duplicateConfirmation = ref(false)
const pendingDuplicate = ref<Person | null>(null)
const showInactive = ref(false)
const saving = ref(false)
const deleteTarget = ref<Person | null>(null)
const deleteDialog = ref<HTMLDialogElement | null>(null)
const deleteConfirmButton = ref<HTMLButtonElement | null>(null)
const deleteTrigger = ref<HTMLButtonElement | null>(null)

const editingPerson = computed(() => peopleStore.people.find(person => person.id === editingId.value) ?? null)
const hasConflicts = computed(() => peopleStore.conflictedPersonIds.length > 0)

function mutationOrder(): number {
  return peopleStore.pendingMutations.reduce((highest, mutation) => Math.max(highest, mutation.createdOrder), -1) + 1
}

function baseRevision(person: Person): number {
  const latest = peopleStore.pendingMutations.filter(item => item.personId === person.id)
    .sort((left, right) => right.createdOrder - left.createdOrder)[0]
  return latest ? latest.baseRevision + 1 : person.revision
}

function saveMutation(person: Person): PendingPersonMutation {
  return Object.freeze({
    id: crypto.randomUUID(), type: 'SavePerson', personId: person.id,
    createdOrder: mutationOrder(), baseRevision: baseRevision(person), payload: Object.freeze({ person }),
  })
}

watch(name, () => {
  pendingDuplicate.value = null
  duplicateConfirmation.value = false
})

function beginEdit(person: Person): void {
  editingId.value = person.id
  name.value = person.name
  duplicateConfirmation.value = false
  pendingDuplicate.value = null
  error.value = ''
}

function resetForm(): void {
  editingId.value = null
  name.value = ''
  duplicateConfirmation.value = false
  pendingDuplicate.value = null
  error.value = ''
}

async function save(): Promise<void> {
  if (saving.value) return
  error.value = ''
  const current = editingId.value
    ? peopleStore.people.find(person => person.id === editingId.value) ?? null
    : null
  const prepared = current
    ? renamePerson(current, name.value)
    : preparePerson(name.value, crypto.randomUUID())
  if (!prepared.person) { error.value = prepared.error ?? 'Die Person konnte nicht vorbereitet werden.'; return }
  const duplicate = peopleStore.people.find(person => person.id !== editingId.value
    && person.name.toLocaleLowerCase('de-DE') === prepared.person!.name.toLocaleLowerCase('de-DE'))
  if (duplicate && !duplicateConfirmation.value) {
    pendingDuplicate.value = duplicate
    error.value = 'Eine Person mit diesem Namen existiert bereits. Bestätige den doppelten Namen ausdrücklich.'
    return
  }
  saving.value = true
  try {
    if (accountStore.isAuthenticated) {
      const mutation = saveMutation(prepared.person)
      await persistPersonMutation(prepared.person, mutation)
      peopleStore.queue(mutation)
    } else await persistPerson(prepared.person)
    peopleStore.save(prepared.person)
    resetForm()
  } catch {
    error.value = 'Die Person konnte nicht sicher auf diesem Gerät gespeichert werden.'
  } finally {
    saving.value = false
  }
}

async function setStatus(person: Person, status: Person['status']): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const updated = Object.freeze({ ...person, status })
    if (accountStore.isAuthenticated) {
      const mutation = saveMutation(updated)
      await persistPersonMutation(updated, mutation)
      peopleStore.queue(mutation)
    } else await persistPerson(updated)
    peopleStore.save(updated)
  } catch {
    error.value = 'Der Personenstatus konnte nicht sicher gespeichert werden.'
  } finally {
    saving.value = false
  }
}

async function remove(person: Person): Promise<void> {
  if (saving.value) return
  const referenced = groupsStore.participants.some(participant => participant.personId === person.id)
  if (referenced) { error.value = 'Verknüpfte Personen können nicht gelöscht, sondern nur deaktiviert werden.'; return }
  if (peopleStore.pendingMutations.some(mutation => mutation.personId === person.id)) {
    error.value = 'Für diese Person steht noch eine Synchronisierung aus. Synchronisiere zuerst unter Account.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    if (accountStore.isAuthenticated) {
      const mutation: PendingPersonMutation = Object.freeze({
        id: crypto.randomUUID(), type: 'DeletePerson', personId: person.id,
        createdOrder: mutationOrder(), baseRevision: baseRevision(person), payload: Object.freeze({}),
      })
      await persistPersonDeleteMutation(person.id, mutation)
      peopleStore.queue(mutation)
    } else await deletePerson(person.id)
    peopleStore.remove(person.id)
    deleteDialog.value?.close()
    deleteTarget.value = null
    if (editingId.value === person.id) resetForm()
  } catch {
    error.value = 'Die Person konnte nicht sicher gelöscht werden.'
  } finally {
    saving.value = false
  }
}

function askDelete(person: Person, trigger: HTMLButtonElement): void {
  if (saving.value) return
  error.value = ''
  const referenced = groupsStore.participants.some(participant => participant.personId === person.id)
  if (referenced) { error.value = 'Verknüpfte Personen können nicht gelöscht, sondern nur deaktiviert werden.'; return }
  if (peopleStore.pendingMutations.some(mutation => mutation.personId === person.id)) {
    error.value = 'Für diese Person steht noch eine Synchronisierung aus. Synchronisiere zuerst unter Account.'
    return
  }
  deleteTarget.value = person
  deleteTrigger.value = trigger
  deleteDialog.value?.showModal()
  nextTick(() => deleteConfirmButton.value?.focus())
}

function closeDelete(): void {
  deleteDialog.value?.close()
  deleteTarget.value = null
  nextTick(() => deleteTrigger.value?.focus())
}

async function confirmDelete(): Promise<void> {
  const person = deleteTarget.value
  if (!person) return
  await remove(person)
  if (error.value) closeDelete()
}
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3" aria-label="← Startseite"><AppIcon name="arrow-left" />Startseite</NuxtLink>
      <header>
        <p class="eyebrow">Dein Personenverzeichnis</p>
        <h1 class="text-3xl font-semibold text-brand-900">Personen</h1>
        <p class="mt-2 text-gray-600">Lege Menschen einmal an und füge sie später deinen Gruppen hinzu.</p>
      </header>

      <div class="card mt-5 p-4" role="note">
        <p class="font-semibold">{{ accountStore.isAuthenticated ? 'Mit dem Account übernommen' : 'Lokal auf diesem Gerät' }}</p>
        <p class="mt-1 text-sm text-gray-600">
          {{ accountStore.isAuthenticated
            ? 'Personenänderungen werden lokal gespeichert und anschließend revisionsgeschützt mit deinem Account synchronisiert.'
            : 'Ohne Account wird dieses Verzeichnis nicht auf andere Geräte übertragen.' }}
        </p>
      </div>

      <div v-if="hasConflicts" class="card mt-4 border-red-200 bg-red-50 p-4" role="alert">
        Eine Person wurde inzwischen auf einem anderen Gerät geändert. Lade unter Account den aktuellen Serverstand; JoinSplit führt die Änderungen nicht automatisch zusammen.
      </div>

      <section class="card mt-6 p-5" aria-labelledby="person-form-title">
        <h2 id="person-form-title" class="text-xl font-semibold">{{ editingPerson ? 'Person bearbeiten' : 'Neue Person' }}</h2>
        <form class="mt-4 space-y-4" @submit.prevent="save">
          <label class="block font-medium">Name<input v-model="name" class="field-input mt-2" autocomplete="name" maxlength="100" required></label>
          <label v-if="pendingDuplicate" class="flex items-start gap-3">
            <input v-model="duplicateConfirmation" class="mt-1 size-5" type="checkbox">
            <span>„{{ pendingDuplicate.name }}“ existiert bereits. Trotzdem eine eigenständige Person anlegen.</span>
          </label>
          <p v-if="error" class="error-text" role="alert">{{ error }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <button class="primary-button w-full" type="submit" :disabled="saving"><AppIcon name="save" />{{ editingPerson ? 'Änderung speichern' : 'Person anlegen' }}</button>
            <button v-if="editingPerson" class="secondary-button w-full" type="button" @click="resetForm">Abbrechen</button>
          </div>
        </form>
      </section>

      <section class="mt-7" aria-labelledby="active-people-title">
        <h2 id="active-people-title" class="text-2xl font-semibold">Aktive Personen</h2>
        <p v-if="!peopleStore.activePeople.length" class="card mt-4 p-5 text-center">Noch keine Person angelegt.</p>
        <ul v-else class="ledger-list mt-4">
          <li v-for="(person, index) in peopleStore.activePeople" :key="person.id" class="ledger-row">
            <ParticipantAvatar :name="person.name" :index="index" size="lg" />
            <span class="min-w-0 flex-1 break-words font-bold">{{ person.name }}</span>
            <button class="icon-button" type="button" :aria-label="`${person.name} bearbeiten`" @click="beginEdit(person)"><AppIcon name="pencil" /></button>
            <button class="icon-button" type="button" :aria-label="`${person.name} deaktivieren`" @click="setStatus(person, 'inactive')"><AppIcon name="user-minus" /></button>
          </li>
        </ul>
      </section>

      <section v-if="peopleStore.inactivePeople.length" class="mt-7" aria-labelledby="inactive-people-title">
        <label class="flex min-h-11 items-center gap-3 font-medium"><input v-model="showInactive" class="size-5" type="checkbox">Deaktivierte Personen anzeigen</label>
        <div v-if="showInactive" class="mt-3">
          <h2 id="inactive-people-title" class="text-xl font-semibold">Deaktivierte Personen</h2>
          <ul class="mt-3 space-y-3">
            <li v-for="person in peopleStore.inactivePeople" :key="person.id" class="card flex flex-wrap items-center gap-3 p-4">
              <span class="min-w-0 flex-1 break-words font-semibold">{{ person.name }}</span>
              <button class="secondary-button" type="button" @click="setStatus(person, 'active')"><AppIcon name="refresh" />Reaktivieren</button>
              <button class="danger-button" type="button" :aria-label="`${person.name} löschen`" @click="askDelete(person, $event.currentTarget as HTMLButtonElement)"><AppIcon name="trash" />Löschen</button>
            </li>
          </ul>
        </div>
      </section>

      <dialog ref="deleteDialog" role="alertdialog" aria-labelledby="delete-person-title" class="delete-dialog rounded-2xl p-0" :aria-busy="saving" @cancel.prevent="closeDelete">
        <div class="p-5">
          <h2 id="delete-person-title" class="text-xl font-semibold">Person endgültig löschen</h2>
          <p class="mt-3">„{{ deleteTarget?.name }}“ wirklich aus dem Personenverzeichnis löschen?</p>
          <p class="mt-2 text-sm text-gray-600">Diese Aktion ist nur möglich, solange keine Gruppenteilnahme und keine ausstehende Änderung auf die Person verweist.</p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button type="button" class="secondary-button" :disabled="saving" @click="closeDelete">Abbrechen</button>
            <button ref="deleteConfirmButton" type="button" class="danger-button" :disabled="saving" @click="confirmDelete"><AppIcon name="trash" />{{ saving ? 'Wird gelöscht …' : 'Endgültig löschen' }}</button>
          </div>
        </div>
      </dialog>
    </div>
  </main>
</template>
