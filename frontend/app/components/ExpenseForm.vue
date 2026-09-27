<script setup lang="ts">
import { calculateEqualShares, formatAmountMinor, localToday, parseAmountMinor, type Expense, type ExpenseDraft, type ExpenseErrors } from '../domain/expense'
import { normalizeName } from '../domain/create-group'
import { hasDuplicateParticipantName } from '../domain/participant'

const props = defineProps<{ groupId: string; expense?: Expense }>()
const emit = defineEmits<{ saved: [expense: Expense] }>()
const groupsStore = useGroupsStore(); const { save } = useExpenses(); const { add } = useParticipants()
const participants = computed(() => groupsStore.participantsForGroup(props.groupId))
const activeParticipants = computed(() => participants.value.filter(item => item.status === 'active'))
const initial = props.expense
const draft = reactive<ExpenseDraft>({ description: initial?.description ?? '', amount: initial ? String(Math.floor(initial.amountMinor / 100)) + ',' + String(initial.amountMinor % 100).padStart(2, '0') : '', incurredOn: initial?.incurredOn ?? localToday(), payerParticipantId: initial?.payerParticipantId ?? (activeParticipants.value.length === 1 ? activeParticipants.value[0]!.id : ''), participantIds: initial?.shares.map(share => share.participantId) ?? activeParticipants.value.map(item => item.id) })
const errors = reactive<ExpenseErrors>({}); const status = ref(''); const submitting = ref(false)
const descriptionInput = ref<HTMLInputElement | null>(null); const amountInput = ref<HTMLInputElement | null>(null); const dateInput = ref<HTMLInputElement | null>(null); const payerSelect = ref<HTMLSelectElement | null>(null); const sharesFieldset = ref<HTMLFieldSetElement | null>(null)
const addName = ref(''); const addError = ref(''); const addInput = ref<HTMLInputElement | null>(null)
const addingParticipant = ref(false); const duplicateParticipantName = ref(''); const duplicateConfirmButton = ref<HTMLButtonElement | null>(null)
const names = computed(() => new Map(participants.value.map(item => [item.id, item.name])))
const preview = computed(() => { const amount = parseAmountMinor(draft.amount); if (amount === null || !draft.participantIds.length) return []; try { return calculateEqualShares(amount, draft.participantIds, participants.value) } catch { return [] } })
const compactParticipantThreshold = 5
const useCompactParticipantPicker = computed(() => participants.value.length >= compactParticipantThreshold)
const participantSearch = ref('')
const selectedParticipants = computed(() => participants.value.filter(participant => draft.participantIds.includes(participant.id)))
const eligibleParticipantIds = computed(() => participants.value
  .filter(participant => participant.status === 'active' || initial?.shares.some(share => share.participantId === participant.id))
  .map(participant => participant.id))
const filteredParticipants = computed(() => {
  const query = participantSearch.value.trim().toLocaleLowerCase('de')
  if (!query) return participants.value
  return participants.value.filter(participant => participant.name.toLocaleLowerCase('de').includes(query))
})

function removeParticipantFromSplit(participantId: string): void {
  const index = draft.participantIds.indexOf(participantId)
  if (index >= 0) draft.participantIds.splice(index, 1)
}

function selectAllParticipants(): void {
  draft.participantIds.splice(0, draft.participantIds.length, ...eligibleParticipantIds.value)
}

function clearParticipantSelection(): void {
  draft.participantIds.splice(0, draft.participantIds.length)
}

async function submit(createAnother = false) {
  if (submitting.value || addingParticipant.value) return
  Object.keys(errors).forEach(key => delete errors[key as keyof ExpenseErrors]); status.value = ''; submitting.value = true
  try {
    const result = await save(props.groupId, { ...draft, participantIds: [...draft.participantIds] }, props.expense)
    if (!result.ok) {
      Object.assign(errors, result.errors); await nextTick()
      if (errors.description) descriptionInput.value?.focus(); else if (errors.amount) amountInput.value?.focus(); else if (errors.incurredOn) dateInput.value?.focus(); else if (errors.payerParticipantId) payerSelect.value?.focus(); else if (errors.participantIds) sharesFieldset.value?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
      return
    }
    if (createAnother && !props.expense) {
      draft.description = ''
      draft.amount = ''
      status.value = 'Ausgabe gespeichert. Du kannst direkt die nächste Ausgabe erfassen.'
      await nextTick()
      descriptionInput.value?.focus()
      return
    }
    emit('saved', result.expense)
  } catch { status.value = 'Die Ausgabe konnte nicht lokal gespeichert werden.' }
  finally { submitting.value = false }
}
watch(addName, () => { duplicateParticipantName.value = '' })

async function addParticipant(duplicateConfirmed = false) {
  if (addingParticipant.value || submitting.value) return
  addError.value = ''; status.value = ''
  if (!duplicateConfirmed && hasDuplicateParticipantName(participants.value, addName.value)) {
    duplicateParticipantName.value = normalizeName(addName.value)
    await nextTick(); duplicateConfirmButton.value?.focus()
    return
  }
  duplicateParticipantName.value = ''
  addingParticipant.value = true
  let restoreAddFocus = false
  try {
    const result = await add(props.groupId, addName.value)
    if (!result.ok) { addError.value = result.errors.name ?? ''; restoreAddFocus = true; return }
    draft.participantIds.push(result.value.participant.id); addName.value = ''; status.value = `„${result.value.participant.name}“ wurde hinzugefügt und für die Aufteilung ausgewählt.`
    restoreAddFocus = true
  } catch { status.value = 'Die Person konnte nicht lokal gespeichert werden.'; restoreAddFocus = true }
  finally {
    addingParticipant.value = false
    if (restoreAddFocus) { await nextTick(); addInput.value?.focus() }
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit(false)">
    <div><label for="expense-description" class="font-semibold">Beschreibung</label><input id="expense-description" ref="descriptionInput" v-model="draft.description" class="field-input mt-2" :aria-invalid="Boolean(errors.description)" :aria-describedby="errors.description ? 'description-error' : undefined"><p v-if="errors.description" id="description-error" class="error-text mt-2">{{ errors.description }}</p></div>
    <div><label for="expense-amount" class="font-semibold">Betrag in Euro</label><input id="expense-amount" ref="amountInput" v-model="draft.amount" inputmode="decimal" class="field-input mt-2" :aria-invalid="Boolean(errors.amount)" :aria-describedby="errors.amount ? 'amount-error amount-help' : 'amount-help'"><p id="amount-help" class="mt-2 text-sm text-gray-600">Zum Beispiel 10,50</p><p v-if="errors.amount" id="amount-error" class="error-text mt-2">{{ errors.amount }}</p></div>
    <div><label for="expense-date" class="font-semibold">Datum</label><input id="expense-date" ref="dateInput" v-model="draft.incurredOn" type="date" class="field-input mt-2" :aria-invalid="Boolean(errors.incurredOn)" :aria-describedby="errors.incurredOn ? 'date-error' : undefined"><p v-if="errors.incurredOn" id="date-error" class="error-text mt-2">{{ errors.incurredOn }}</p></div>
    <div><label for="expense-payer" class="font-semibold">Bezahlt von</label><select id="expense-payer" ref="payerSelect" v-model="draft.payerParticipantId" class="field-input mt-2" :aria-invalid="Boolean(errors.payerParticipantId)" :aria-describedby="errors.payerParticipantId ? 'payer-error' : undefined"><option value="" disabled>Person auswählen</option><option v-for="participant in participants" :key="participant.id" :value="participant.id" :disabled="participant.status === 'inactive' && participant.id !== expense?.payerParticipantId">{{ participant.name }}{{ participant.status === 'inactive' ? ' (inaktiv)' : '' }}</option></select><p v-if="errors.payerParticipantId" id="payer-error" class="error-text mt-2">{{ errors.payerParticipantId }}</p></div>
    <fieldset ref="sharesFieldset" class="min-w-0" :aria-describedby="errors.participantIds ? 'shares-help shares-error' : 'shares-help'" :aria-invalid="Boolean(errors.participantIds)">
      <legend class="font-semibold">Gleichmäßig aufteilen</legend>
      <p id="shares-help" class="mt-1 text-sm text-gray-600">Die Reihenfolge der Gruppe bestimmt, wer Rest-Cents erhält.</p>

      <template v-if="useCompactParticipantPicker">
        <div class="mt-3">
          <p class="text-sm font-medium">Ausgewählt ({{ selectedParticipants.length }})</p>
          <div v-if="selectedParticipants.length" class="mt-2 flex max-h-36 min-w-0 flex-wrap gap-2 overflow-y-auto rounded-xl border border-gray-200 p-2" aria-label="Ausgewählte Personen">
            <span v-for="participant in selectedParticipants" :key="participant.id" class="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-sm text-brand-900">
              <span class="min-w-0 truncate">{{ participant.name }}{{ participant.status === 'inactive' ? ' (inaktiv)' : '' }}</span>
              <button type="button" class="inline-flex size-8 shrink-0 items-center justify-center rounded-full" :aria-label="`${participant.name} aus Aufteilung entfernen`" @click="removeParticipantFromSplit(participant.id)">
                <span aria-hidden="true">×</span>
              </button>
            </span>
          </div>
          <p v-else class="mt-2 rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-600">Noch keine Person ausgewählt.</p>
        </div>

        <details class="relative mt-3">
          <summary class="secondary-button w-full cursor-pointer select-none justify-between">
            <span>Personen auswählen</span>
            <span class="text-sm font-normal">{{ selectedParticipants.length }} von {{ eligibleParticipantIds.length }}</span>
          </summary>
          <div class="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
            <label for="expense-participant-search" class="sr-only">Personen durchsuchen</label>
            <input id="expense-participant-search" v-model="participantSearch" type="search" class="field-input" placeholder="Person suchen …" autocomplete="off">
            <div class="mt-2 flex gap-2">
              <button type="button" class="secondary-button min-h-10 flex-1 px-3 py-2 text-sm" @click="selectAllParticipants">Alle auswählen</button>
              <button type="button" class="secondary-button min-h-10 flex-1 px-3 py-2 text-sm" @click="clearParticipantSelection">Auswahl leeren</button>
            </div>
            <div class="mt-2 max-h-56 overflow-y-auto">
              <label v-for="participant in filteredParticipants" :key="participant.id" class="flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-2 hover:bg-white">
                <input v-model="draft.participantIds" type="checkbox" :value="participant.id" :disabled="participant.status === 'inactive' && !expense?.shares.some(share => share.participantId === participant.id)">
                <span class="min-w-0 break-words">{{ participant.name }}{{ participant.status === 'inactive' ? ' (inaktiv)' : '' }}</span>
              </label>
              <p v-if="!filteredParticipants.length" class="p-3 text-sm text-gray-600">Keine passende Person gefunden.</p>
            </div>
          </div>
        </details>
      </template>

      <div v-else class="mt-3 space-y-2">
        <label v-for="participant in participants" :key="participant.id" class="flex min-h-11 min-w-0 items-center gap-3">
          <input v-model="draft.participantIds" type="checkbox" :value="participant.id" :disabled="participant.status === 'inactive' && !expense?.shares.some(share => share.participantId === participant.id)">
          <span class="min-w-0 break-words">{{ participant.name }}{{ participant.status === 'inactive' ? ' (inaktiv)' : '' }}</span>
        </label>
      </div>
      <p v-if="errors.participantIds" id="shares-error" role="alert" class="error-text mt-2">{{ errors.participantIds }}</p>
    </fieldset>
    <section class="card min-w-0 p-4" aria-labelledby="split-preview"><h2 id="split-preview" class="text-lg font-semibold">Vorschau der Aufteilung</h2><p v-if="!preview.length" class="mt-2 text-gray-600">Betrag und mindestens eine Person auswählen.</p><ul v-else class="mt-3 space-y-2"><li v-for="share in preview" :key="share.participantId" class="flex min-w-0 flex-wrap justify-between gap-4"><span class="min-w-0 break-words">{{ names.get(share.participantId) }}</span><strong>{{ formatAmountMinor(share.amountMinor) }}</strong></li></ul></section>
    <section class="card min-w-0 p-4" aria-labelledby="add-during-expense" :aria-busy="addingParticipant"><h2 id="add-during-expense" class="font-semibold">Weitere Person hinzufügen</h2><div class="mt-2 flex flex-col gap-2 sm:flex-row"><label for="draft-participant" class="sr-only">Name der neuen Person</label><input id="draft-participant" ref="addInput" v-model="addName" class="field-input" :disabled="addingParticipant || submitting" :aria-invalid="Boolean(addError)" :aria-describedby="addError ? 'draft-participant-error' : undefined"><button type="button" class="secondary-button shrink-0" :disabled="addingParticipant || submitting" @click="addParticipant()">{{ addingParticipant ? 'Wird hinzugefügt …' : 'Hinzufügen' }}</button></div><p v-if="addError" id="draft-participant-error" class="error-text mt-2">{{ addError }}</p><div v-if="duplicateParticipantName" class="mt-3 min-w-0 rounded-lg bg-amber-50 p-3 text-amber-950" role="alert"><p class="font-semibold">Name bereits vorhanden</p><p class="mt-1 break-words">Der Name „{{ duplicateParticipantName }}“ wird in dieser Gruppe bereits verwendet.</p><button ref="duplicateConfirmButton" type="button" class="secondary-button mt-3" :disabled="addingParticipant || submitting" @click="addParticipant(true)">Trotzdem hinzufügen</button></div></section>
    <p v-if="status" :class="status.includes('konnte nicht') ? 'error-text' : 'text-brand-900'" :role="status.includes('konnte nicht') ? 'alert' : 'status'">{{ status }}</p>
    <div class="grid gap-2" :class="expense ? '' : 'sm:grid-cols-2'">
      <button type="submit" class="primary-button w-full" :disabled="submitting || addingParticipant"><AppIcon name="save" />{{ expense ? 'Änderungen speichern' : 'Ausgabe speichern' }}</button>
      <button v-if="!expense" type="button" class="secondary-button w-full" :disabled="submitting || addingParticipant" @click="submit(true)"><AppIcon name="plus" />Speichern & nächste Ausgabe</button>
    </div>
  </form>
</template>
