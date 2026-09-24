<script setup lang="ts">
import { formatAmountMinor } from '../../../domain/expense'
import { calculateParticipantBalances } from '../../../domain/balance'
const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const { archive, reactivate, remove } = useGroupLifecycle()
const heading = ref<HTMLHeadingElement | null>(null)
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const participantNames = computed(() => new Map(groupsStore.participantsForGroup(groupId.value).map(item => [item.id, item.name])))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const settlements = computed(() => groupsStore.settlementsForGroup(groupId.value))
const hasOpenBalances = computed(() => group.value?.hasFinancialHistory === true
  && calculateParticipantBalances(groupId.value, participants.value, expenses.value, settlements.value)
    .some(balance => balance.balanceAmountMinor !== 0n))
const pendingCount = computed(() => groupsStore.pendingMutations.filter(mutation => mutation.groupId === groupId.value).length)
const lifecycleDialog = ref<HTMLDialogElement | null>(null)
const lifecycleTrigger = ref<HTMLButtonElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)
const requestedAction = ref<'archive' | 'delete' | null>(null)
const focusAfterDialogClose = ref<'reactivate' | null>(null)
const lifecycleBusy = ref(false)
const lifecycleError = ref('')

function askLifecycle(action: 'archive' | 'delete', trigger: HTMLButtonElement): void {
  requestedAction.value = action; lifecycleTrigger.value = trigger; lifecycleError.value = ''
  lifecycleDialog.value?.showModal(); void nextTick(() => confirmButton.value?.focus())
}
function closeLifecycle(): void {
  if (lifecycleBusy.value) return
  lifecycleDialog.value?.close(); requestedAction.value = null; lifecycleTrigger.value?.focus()
}
async function restoreFocusAfterDialogClose(): Promise<void> {
  if (focusAfterDialogClose.value !== 'reactivate') return
  focusAfterDialogClose.value = null
  await nextTick()
  document.querySelector<HTMLButtonElement>('#group-reactivate-button')?.focus()
}
async function confirmLifecycle(): Promise<void> {
  if (!requestedAction.value || lifecycleBusy.value) return
  lifecycleBusy.value = true; lifecycleError.value = ''
  try {
    if (requestedAction.value === 'archive') {
      await archive(groupId.value); focusAfterDialogClose.value = 'reactivate'
      lifecycleDialog.value?.close(); requestedAction.value = null
    } else {
      await remove(groupId.value); lifecycleDialog.value?.close(); await router.push('/?deleted=1')
    }
  } catch {
    lifecycleError.value = requestedAction.value === 'archive'
      ? 'Die Gruppe konnte nicht lokal archiviert werden.'
      : 'Die Gruppe konnte nicht lokal zur Löschung vorgemerkt werden.'
  } finally {
    lifecycleBusy.value = false
  }
}
async function reactivateGroup(): Promise<void> {
  if (lifecycleBusy.value) return
  lifecycleBusy.value = true; lifecycleError.value = ''
  let reactivated = false
  try { await reactivate(groupId.value); reactivated = true }
  catch { lifecycleError.value = 'Die Gruppe konnte nicht lokal reaktiviert werden.' }
  finally {
    lifecycleBusy.value = false
    if (reactivated) {
      await nextTick()
      document.querySelector<HTMLButtonElement>('#group-archive-button')?.focus()
    }
  }
}

onMounted(async () => {
  if (route.query.created === '1' && group.value) {
    await nextTick()
    heading.value?.focus()
  }
})
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3">← Gruppen</NuxtLink>

      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">Gruppe</p>
        <h1 ref="heading" tabindex="-1" class="mt-2 text-3xl font-semibold text-brand-900">
          {{ group.name }}
        </h1>
        <p class="mt-2 text-gray-600">Währung: {{ group.currency }}</p>
        <p v-if="group.status === 'archived'" class="mt-3 rounded-lg bg-gray-100 p-3 text-gray-800">
          Archiviert und schreibgeschützt. Ausgaben, Salden, Zahlungen und persönliche Stände bleiben lesbar.
        </p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <div class="mt-6 space-y-3">
        <p v-if="route.query.created === '1'" class="rounded-lg bg-brand-50 p-3 text-brand-900">
          Gruppe lokal erstellt.
        </p>
        <GroupSyncStatus :group-id="group.id" show-synced />
      </div>

      <p v-if="route.query.deleted === '1'" class="mt-6 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Ausgabe lokal gelöscht.</p>
      <section v-if="!expenses.length" class="card mt-7 px-5 py-8 text-center" aria-labelledby="empty-expenses">
        <h2 id="empty-expenses" class="text-xl font-semibold">Noch keine Ausgaben</h2>
        <p class="mt-2 text-gray-600">Erfasste Ausgaben erscheinen später hier.</p>
      </section>
      <section v-else class="mt-7" aria-labelledby="expenses-title"><h2 id="expenses-title" class="text-xl font-semibold">Ausgaben</h2><ul class="mt-3 space-y-3"><li v-for="expense in expenses" :key="expense.id"><NuxtLink :to="`/groups/${group.id}/expenses/${expense.id}`" class="card block p-4"><span class="flex justify-between gap-4"><strong>{{ expense.description }}</strong><span>{{ formatAmountMinor(expense.amountMinor) }}</span></span><span class="mt-1 block text-sm text-gray-600">{{ expense.incurredOn }} · bezahlt von {{ participantNames.get(expense.payerParticipantId) }}</span></NuxtLink></li></ul></section>

      <NuxtLink v-if="group.status === 'active'" :to="`/groups/${group.id}/expenses/new`" class="primary-button mt-5 w-full">Ausgabe erfassen</NuxtLink>

      <section class="card mt-7 p-5" aria-labelledby="group-lifecycle-title">
        <h2 id="group-lifecycle-title" class="text-xl font-semibold">Gruppe verwalten</h2>
        <p v-if="lifecycleError && !requestedAction" class="error-text mt-3" role="alert">{{ lifecycleError }}</p>
        <button v-if="group.status === 'archived'" id="group-reactivate-button" type="button" class="primary-button mt-4 w-full" :disabled="lifecycleBusy" @click="reactivateGroup">
          {{ lifecycleBusy ? 'Wird reaktiviert …' : 'Gruppe reaktivieren' }}
        </button>
        <template v-else-if="group.hasFinancialHistory">
          <p class="mt-2 text-sm text-gray-600">Die Historie bleibt beim Archivieren vollständig lesbar.</p>
          <button id="group-archive-button" ref="lifecycleTrigger" type="button" class="secondary-button mt-4 w-full" :disabled="lifecycleBusy" @click="askLifecycle('archive', $event.currentTarget as HTMLButtonElement)">Gruppe archivieren</button>
        </template>
        <template v-else>
          <p v-if="pendingCount" class="mt-2 text-sm text-gray-600">Die Gruppe kann erst endgültig gelöscht werden, wenn {{ pendingCount }} ausstehende {{ pendingCount === 1 ? 'Änderung' : 'Änderungen' }} synchronisiert wurden.</p>
          <button v-else ref="lifecycleTrigger" type="button" class="danger-button mt-4 w-full" :disabled="lifecycleBusy" @click="askLifecycle('delete', $event.currentTarget as HTMLButtonElement)">Gruppe endgültig löschen</button>
        </template>
      </section>

      <dialog ref="lifecycleDialog" role="alertdialog" class="delete-dialog rounded-2xl p-0" aria-labelledby="group-lifecycle-dialog-title" aria-describedby="group-lifecycle-dialog-description" :aria-busy="lifecycleBusy" @cancel.prevent="closeLifecycle" @close="restoreFocusAfterDialogClose">
        <div class="p-5">
          <h2 id="group-lifecycle-dialog-title" class="text-xl font-semibold">{{ requestedAction === 'archive' ? 'Gruppe archivieren' : 'Gruppe endgültig löschen' }}</h2>
          <div id="group-lifecycle-dialog-description" class="mt-3 space-y-2">
            <p v-if="requestedAction === 'archive'">„{{ group.name }}“ wird schreibgeschützt, bleibt aber vollständig lesbar.</p>
            <template v-else><p>„{{ group.name }}“ und {{ participants.length }} {{ participants.length === 1 ? 'Person' : 'Personen' }} endgültig löschen?</p><p>Diese Aktion kann nicht rückgängig gemacht werden.</p></template>
            <p v-if="requestedAction === 'archive' && hasOpenBalances" class="rounded-lg bg-amber-50 p-3 text-amber-950">Es bestehen offene Salden. Archivieren gleicht sie nicht aus.</p>
            <p v-if="requestedAction === 'archive' && pendingCount" class="rounded-lg bg-amber-50 p-3 text-amber-950">{{ pendingCount }} ausstehende {{ pendingCount === 1 ? 'Änderung wird' : 'Änderungen werden' }} zuerst synchronisiert; die Archivierung folgt danach.</p>
          </div>
          <p v-if="lifecycleError" class="error-text mt-3" role="alert">{{ lifecycleError }}</p>
          <div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" class="secondary-button" :disabled="lifecycleBusy" @click="closeLifecycle">Abbrechen</button>
            <button ref="confirmButton" type="button" :class="requestedAction === 'delete' ? 'danger-button' : 'primary-button'" :disabled="lifecycleBusy" @click="confirmLifecycle">{{ lifecycleBusy ? 'Wird gespeichert …' : requestedAction === 'archive' ? 'Jetzt archivieren' : 'Endgültig löschen' }}</button>
          </div>
        </div>
      </dialog>

    </div>

    <div v-else class="page-content">
      <h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1>
      <p class="mt-3 text-gray-600">Der lokale Gruppenstand ist in dieser Sitzung nicht vorhanden.</p>
      <NuxtLink to="/" class="primary-button mt-6">Zur Gruppenliste</NuxtLink>
    </div>
  </main>
</template>
