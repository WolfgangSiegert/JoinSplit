<script setup lang="ts">
import { localToday } from '../domain/expense'
import { settlementAmountInput, type Settlement, type SettlementDraft, type SettlementErrors } from '../domain/settlement'

const props = defineProps<{ groupId: string; settlement?: Settlement }>()
const emit = defineEmits<{ saved: [settlement: Settlement] }>()
const groupsStore = useGroupsStore()
const { save } = useSettlements()
const participants = computed(() => groupsStore.participantsForGroup(props.groupId))
const initial = props.settlement
const draft = reactive<SettlementDraft>({
  senderParticipantId: initial?.senderParticipantId ?? '',
  receiverParticipantId: initial?.receiverParticipantId ?? '',
  amount: initial ? settlementAmountInput(initial.amountMinor) : '',
  occurredOn: initial?.occurredOn ?? localToday(),
})
const errors = reactive<SettlementErrors>({})
const confirmationReasons = ref<readonly ('wrong_direction' | 'exceeds_open_amount')[]>([])
const submitting = ref(false)
const status = ref('')
const errorAnnouncement = ref('')
const submitButton = ref<HTMLButtonElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)
const senderSelect = ref<HTMLSelectElement | null>(null)
const receiverSelect = ref<HTMLSelectElement | null>(null)
const amountInput = ref<HTMLInputElement | null>(null)
const dateInput = ref<HTMLInputElement | null>(null)

watch(draft, () => { confirmationReasons.value = [] }, { deep: true })

async function submit(confirmationAccepted = false): Promise<void> {
  if (submitting.value) return
  let focusAfterSubmit: 'confirm' | 'sender' | 'receiver' | 'amount' | 'date' | null = null
  Object.keys(errors).forEach(key => delete errors[key as keyof SettlementErrors])
  status.value = ''; errorAnnouncement.value = ''; submitting.value = true
  try {
    const result = await save(props.groupId, { ...draft }, props.settlement, confirmationAccepted)
    if (!result.ok) {
      Object.assign(errors, result.errors)
      confirmationReasons.value = result.confirmationReasons ?? []
      if (confirmationReasons.value.length) focusAfterSubmit = 'confirm'
      else {
        if (!errors.balance) errorAnnouncement.value = 'Die Zahlung konnte nicht gespeichert werden. Bitte prüfe das markierte Feld.'
        if (errors.senderParticipantId) focusAfterSubmit = 'sender'
        else if (errors.receiverParticipantId) focusAfterSubmit = 'receiver'
        else if (errors.amount) focusAfterSubmit = 'amount'
        else if (errors.occurredOn) focusAfterSubmit = 'date'
        else if (errors.balance) focusAfterSubmit = 'amount'
      }
      return
    }
    emit('saved', result.settlement)
  } catch { status.value = 'Die Zahlung konnte nicht lokal gespeichert werden.' }
  finally {
    submitting.value = false
    if (focusAfterSubmit) {
      await nextTick()
      if (focusAfterSubmit === 'confirm') confirmButton.value?.focus()
      else if (focusAfterSubmit === 'sender') senderSelect.value?.focus()
      else if (focusAfterSubmit === 'receiver') receiverSelect.value?.focus()
      else if (focusAfterSubmit === 'amount') amountInput.value?.focus()
      else dateInput.value?.focus()
    }
  }
}

async function cancelConfirmation(): Promise<void> {
  confirmationReasons.value = []
  await nextTick(); submitButton.value?.focus()
}
</script>

<template>
  <form class="space-y-5" :aria-busy="submitting" @submit.prevent="submit(false)">
    <p v-if="errorAnnouncement" class="sr-only" role="alert">{{ errorAnnouncement }}</p>
    <div><label for="settlement-sender" class="font-semibold">Gezahlt von</label><select id="settlement-sender" ref="senderSelect" v-model="draft.senderParticipantId" class="field-input mt-2" :aria-invalid="Boolean(errors.senderParticipantId)" :aria-describedby="errors.senderParticipantId ? 'settlement-sender-error' : undefined"><option value="" disabled>Person auswählen</option><option v-for="participant in participants" :key="participant.id" :value="participant.id">{{ participant.name }}{{ participant.status === 'inactive' ? ' (inaktiv)' : '' }}</option></select><p v-if="errors.senderParticipantId" id="settlement-sender-error" class="error-text mt-2">{{ errors.senderParticipantId }}</p></div>
    <div><label for="settlement-receiver" class="font-semibold">Gezahlt an</label><select id="settlement-receiver" ref="receiverSelect" v-model="draft.receiverParticipantId" class="field-input mt-2" :aria-invalid="Boolean(errors.receiverParticipantId)" :aria-describedby="errors.receiverParticipantId ? 'settlement-receiver-error' : undefined"><option value="" disabled>Person auswählen</option><option v-for="participant in participants" :key="participant.id" :value="participant.id">{{ participant.name }}{{ participant.status === 'inactive' ? ' (inaktiv)' : '' }}</option></select><p v-if="errors.receiverParticipantId" id="settlement-receiver-error" class="error-text mt-2">{{ errors.receiverParticipantId }}</p></div>
    <div><label for="settlement-amount" class="font-semibold">Betrag in Euro</label><input id="settlement-amount" ref="amountInput" v-model="draft.amount" inputmode="decimal" class="field-input mt-2" :aria-invalid="Boolean(errors.amount)" :aria-describedby="errors.amount ? 'settlement-amount-help settlement-amount-error' : 'settlement-amount-help'"><p id="settlement-amount-help" class="mt-2 text-sm text-gray-600">Zum Beispiel 10,50</p><p v-if="errors.amount" id="settlement-amount-error" class="error-text mt-2">{{ errors.amount }}</p></div>
    <div><label for="settlement-date" class="font-semibold">Datum</label><input id="settlement-date" ref="dateInput" v-model="draft.occurredOn" type="date" class="field-input mt-2" :aria-invalid="Boolean(errors.occurredOn)" :aria-describedby="errors.occurredOn ? 'settlement-date-error' : undefined"><p v-if="errors.occurredOn" id="settlement-date-error" class="error-text mt-2">{{ errors.occurredOn }}</p></div>
    <p v-if="errors.balance" class="error-text" role="alert">{{ errors.balance }}</p>
    <section v-if="confirmationReasons.length" class="rounded-lg bg-amber-50 p-4 text-amber-950" role="alert" aria-labelledby="settlement-confirmation-title">
      <h2 id="settlement-confirmation-title" class="font-semibold">Zahlung nochmals prüfen</h2>
      <p v-if="confirmationReasons.includes('wrong_direction')" class="mt-2">Die Zahlung läuft entgegen der aktuell offenen Salden.</p>
      <p v-if="confirmationReasons.includes('exceeds_open_amount')" class="mt-2">Die Zahlung ist höher als mindestens ein direkt offener Saldo.</p>
      <p class="mt-2">Wenn die Zahlung tatsächlich so erfolgt ist, kannst du sie trotzdem dokumentieren.</p>
      <div class="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" class="secondary-button" :disabled="submitting" @click="cancelConfirmation">Abbrechen</button><button ref="confirmButton" type="button" class="primary-button" :disabled="submitting" @click="submit(true)">Trotzdem speichern</button></div>
    </section>
    <p v-if="status" class="error-text" role="alert">{{ status }}</p>
    <button v-if="!confirmationReasons.length" ref="submitButton" type="submit" class="primary-button w-full" :disabled="submitting">{{ settlement ? 'Änderungen speichern' : 'Zahlung speichern' }}</button>
  </form>
</template>
