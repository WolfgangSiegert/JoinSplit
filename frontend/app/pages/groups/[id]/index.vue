<script setup lang="ts">
import { formatAmountMinor } from '../../../domain/expense'
import { calculateParticipantBalances, formatSignedAmountMinor } from '../../../domain/balance'
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
const totalExpensesMinor = computed(() => expenses.value.reduce((sum, expense) => sum + expense.amountMinor, 0))
const balances = computed(() => calculateParticipantBalances(groupId.value, participants.value, expenses.value, settlements.value))
const balanceByParticipant = computed(() => new Map(balances.value.map(balance => [balance.participantId, balance.balanceAmountMinor])))
const visibleParticipants = computed(() => participants.value.slice(0, 3))
const largestAbsoluteBalance = computed(() => balances.value.reduce((largest, balance) => {
  const absolute = balance.balanceAmountMinor < 0n ? -balance.balanceAmountMinor : balance.balanceAmountMinor
  return absolute > largest ? absolute : largest
}, 0n))
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

function participantState(amount: bigint): string {
  if (amount > 0n) return 'erhält'
  if (amount < 0n) return 'zahlt'
  return 'ausgeglichen'
}

function balanceBarWidth(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount
  if (largestAbsoluteBalance.value === 0n) return '0%'
  return `${Math.max(10, Number((absolute * 100n) / largestAbsoluteBalance.value))}%`
}

function participantSummary(): string {
  const names = visibleParticipants.value.map(participant => participant.name)
  if (participants.value.length > 3) return `${names.join(', ')} und ${participants.value.length - 3} weitere`
  if (names.length < 2) return names[0] ?? 'Noch niemand'
  return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

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
      <div class="flex items-center justify-between gap-3">
        <NuxtLink to="/" class="secondary-link -ml-4" aria-label="← Gruppen"><AppIcon name="arrow-left" />Gruppen</NuxtLink>
        <GroupSyncStatus :group-id="group.id" show-synced compact />
      </div>

      <header class="min-w-0">
        <h1 ref="heading" tabindex="-1" class="mt-2 break-words text-3xl font-bold text-ink-900">
          {{ group.name }}
        </h1>
        <p class="mt-2 text-sm font-medium text-ink-700">{{ participants.length }} {{ participants.length === 1 ? 'Person' : 'Personen' }} · {{ group.currency }}</p>
        <p v-if="group.status === 'archived'" class="mt-3 rounded-lg bg-gray-100 p-3 text-gray-800">
          Archiviert und schreibgeschützt. Ausgaben, Salden, Zahlungen und persönliche Stände bleiben lesbar.
        </p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <div class="mt-4 space-y-3">
        <p v-if="route.query.created === '1'" class="rounded-lg bg-brand-50 p-3 text-brand-900">
          Gruppe lokal erstellt.
        </p>
      </div>

      <p v-if="route.query.deleted === '1'" class="status-panel mt-6 border-brand-100 bg-brand-50 text-brand-900" role="status">Ausgabe lokal gelöscht.</p>

      <section v-if="expenses.length" class="mt-6" aria-labelledby="group-overview-title">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-gray-300 pb-6">
          <div class="min-w-0">
            <div class="-space-x-3" aria-label="Teilnehmer">
              <ParticipantAvatar v-for="(participant, index) in visibleParticipants" :key="participant.id" :name="participant.name" :index="index" size="lg" />
            </div>
            <p class="mt-2 truncate font-bold">{{ participantSummary() }}</p>
            <p class="text-sm text-ink-700">teilen ihre Ausgaben</p>
          </div>
          <div class="text-right">
            <p id="group-overview-title" class="eyebrow">Gesamtausgaben</p>
            <p class="amount-display amount-display--compact mt-2">{{ formatAmountMinor(totalExpensesMinor) }}</p>
          </div>
        </div>
        <h2 class="mt-5 text-xl font-bold">Salden pro Teilnehmer</h2>
        <ul class="mt-2 space-y-2" aria-label="Salden im Überblick">
          <li v-for="(participant, index) in visibleParticipants" :key="participant.id" class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <ParticipantAvatar :name="participant.name" :index="index" size="sm" />
            <div class="min-w-0">
              <div class="flex items-baseline justify-between gap-2"><p class="truncate text-sm font-bold">{{ participant.name }}</p><p class="text-xs text-ink-700">{{ participantState(balanceByParticipant.get(participant.id) ?? 0n) }}</p></div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                <div class="h-full rounded-full" :class="index === 0 ? 'bg-sky-500' : index === 1 ? 'bg-amber-400' : 'bg-rose-400'" :style="{ width: balanceBarWidth(balanceByParticipant.get(participant.id) ?? 0n) }" />
              </div>
            </div>
            <p class="amount-value text-sm">{{ formatSignedAmountMinor(balanceByParticipant.get(participant.id) ?? 0n) }}</p>
          </li>
        </ul>
      </section>

      <section v-if="!expenses.length" class="card mt-7 px-5 py-8 text-center" aria-labelledby="empty-expenses">
        <h2 id="empty-expenses" class="text-xl font-semibold">Noch keine Ausgaben</h2>
        <p class="mt-2 text-gray-600">Erfasste Ausgaben erscheinen später hier.</p>
      </section>
      <section v-else class="mt-6 min-w-0" aria-labelledby="expenses-title">
        <div class="flex items-end justify-between gap-3"><h2 id="expenses-title" class="text-2xl font-bold">Ausgaben</h2><p class="text-sm text-ink-700">Neueste zuerst</p></div>
        <ul class="expense-ledger ledger-list mt-3">
          <li v-for="(expense, index) in expenses" :key="expense.id" class="min-w-0">
            <NuxtLink :to="`/groups/${group.id}/expenses/${expense.id}`" class="ledger-row min-w-0">
              <ParticipantAvatar :name="participantNames.get(expense.payerParticipantId) ?? '?'" :index="index" size="sm" />
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-base">{{ expense.description }}</strong>
                <span class="mt-1 block break-words text-sm text-ink-700">{{ expense.incurredOn }} · {{ participantNames.get(expense.payerParticipantId) }} hat bezahlt</span>
              </span>
              <span class="amount-value">{{ formatAmountMinor(expense.amountMinor) }}</span>
              <span class="text-xl text-ink-700" aria-hidden="true">›</span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <NuxtLink v-if="group.status === 'active'" :to="`/groups/${group.id}/expenses/new`" class="primary-button sticky bottom-4 z-10 mt-6 w-full"><AppIcon name="plus" />Ausgabe hinzufügen</NuxtLink>

      <section class="card mt-7 p-5" aria-labelledby="group-lifecycle-title">
        <h2 id="group-lifecycle-title" class="text-xl font-semibold">Gruppe verwalten</h2>
        <p v-if="lifecycleError && !requestedAction" class="error-text mt-3" role="alert">{{ lifecycleError }}</p>
        <button v-if="group.status === 'archived'" id="group-reactivate-button" type="button" class="primary-button mt-4 w-full" :disabled="lifecycleBusy" @click="reactivateGroup">
          <AppIcon name="rotate-ccw" />
          {{ lifecycleBusy ? 'Wird reaktiviert …' : 'Gruppe reaktivieren' }}
        </button>
        <template v-else-if="group.hasFinancialHistory">
          <p class="mt-2 text-sm text-gray-600">Die Historie bleibt beim Archivieren vollständig lesbar.</p>
          <button id="group-archive-button" ref="lifecycleTrigger" type="button" class="secondary-button mt-4 w-full" :disabled="lifecycleBusy" @click="askLifecycle('archive', $event.currentTarget as HTMLButtonElement)"><AppIcon name="archive" />Gruppe archivieren</button>
        </template>
        <template v-else>
          <p v-if="pendingCount" class="mt-2 text-sm text-gray-600">Die Gruppe kann erst endgültig gelöscht werden, wenn {{ pendingCount }} ausstehende {{ pendingCount === 1 ? 'Änderung' : 'Änderungen' }} synchronisiert wurden.</p>
          <button v-else ref="lifecycleTrigger" type="button" class="danger-button mt-4 w-full" :disabled="lifecycleBusy" @click="askLifecycle('delete', $event.currentTarget as HTMLButtonElement)"><AppIcon name="trash" />Gruppe endgültig löschen</button>
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
