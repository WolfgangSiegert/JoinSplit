<script setup lang="ts">
import { formatAmountMinor } from '../../../domain/expense'
import { calculateParticipantBalances } from '../../../domain/balance'
const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const { t } = useAppI18n()
const { archive, reactivate, remove } = useGroupLifecycle()
const heading = ref<HTMLHeadingElement | null>(null)
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const expenseSearchQuery = ref('')
const participantNames = computed(() => new Map(groupsStore.participantsForGroup(groupId.value).map(item => [item.id, item.name])))
const normalizedExpenseSearchQuery = computed(() => expenseSearchQuery.value.trim().toLocaleLowerCase('de-DE'))
const filteredExpenses = computed(() => expenses.value.filter((expense) => {
  const payerName = participantNames.value.get(expense.payerParticipantId) ?? ''
  return [expense.description, payerName, expense.incurredOn]
    .some(value => value.toLocaleLowerCase('de-DE').includes(normalizedExpenseSearchQuery.value))
}))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const settlements = computed(() => groupsStore.settlementsForGroup(groupId.value))
const totalExpensesMinor = computed(() => expenses.value.reduce((sum, expense) => sum + expense.amountMinor, 0))
const visibleParticipants = computed(() => participants.value.slice(0, 3))
const expenseList = ref<HTMLElement | null>(null)
const expenseListScrollable = ref(false)
const expenseListHasMore = ref(false)
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

function participantSummary(): string {
  const names = visibleParticipants.value.map(participant => participant.name)
  if (participants.value.length > 3) return `${names.join(', ')} und ${participants.value.length - 3} weitere`
  if (names.length < 2) return names[0] ?? 'Noch niemand'
  return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

function updateScrollState(element: HTMLElement | null, scrollable: Ref<boolean>, hasMore: Ref<boolean>): void {
  if (!element) {
    scrollable.value = false
    hasMore.value = false
    return
  }
  scrollable.value = element.scrollHeight > element.clientHeight + 1
  hasMore.value = scrollable.value && element.scrollTop + element.clientHeight < element.scrollHeight - 2
}

function updateExpenseScrollState(): void {
  updateScrollState(expenseList.value, expenseListScrollable, expenseListHasMore)
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
      await remove(groupId.value); lifecycleDialog.value?.close(); await router.push('/groups?deleted=1')
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
  await nextTick()
  updateExpenseScrollState()
  window.addEventListener('resize', updateExpenseScrollState)
})

watch(filteredExpenses, async () => {
  await nextTick()
  updateExpenseScrollState()
})

onBeforeUnmount(() => window.removeEventListener('resize', updateExpenseScrollState))
</script>

<template>
  <main class="page-shell">
    <div v-if="group" class="page-content">
      <NuxtLink to="/groups" class="secondary-link -ml-4 mb-3" :aria-label="`← ${t('group.back.groups')}`"><AppIcon name="arrow-left" />{{ t('group.back.groups') }}</NuxtLink>

      <header class="group-view-heading min-w-0">
        <p class="group-view-heading__group-meta">
          <strong class="group-view-heading__group-name">{{ group.name }}</strong>
          <span aria-hidden="true">•</span>
          <span>{{ participants.length }} {{ participants.length === 1 ? t('group.meta.person') : t('group.meta.people') }}</span>
          <span aria-hidden="true">•</span>
          <span>{{ group.currency }}</span>
        </p>
        <div class="group-view-heading__title-row">
          <h1 ref="heading" tabindex="-1" class="break-words text-4xl font-bold text-ink-900">{{ t('group.expenses.title') }}</h1>
          <GroupSyncStatus :group-id="group.id" show-synced compact mobile-collapsible class="group-view-heading__sync" />
        </div>
        <p class="mt-2 text-ink-700">{{ t('group.expenses.lead') }}</p>
        <p class="group-view-heading__description mt-2 text-sm text-ink-700">{{ t('group.expenses.copy') }}</p>
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
      </section>

      <section v-if="!expenses.length" class="card mt-7 px-5 py-8 text-center" aria-labelledby="empty-expenses">
        <h2 id="empty-expenses" class="text-xl font-semibold">Noch keine Ausgaben</h2>
        <p class="mt-2 text-gray-600">Erfasste Ausgaben erscheinen später hier.</p>
      </section>
      <section v-else class="mt-6 min-w-0" aria-labelledby="expenses-title">
        <div class="list-section-heading">
          <div>
            <h2 id="expenses-title" class="text-2xl font-bold">Ausgaben</h2>
            <p class="mt-1 text-sm text-ink-700">{{ filteredExpenses.length }}<span v-if="expenseSearchQuery"> von {{ expenses.length }}</span> · Neueste zuerst</p>
          </div>
          <ListSearch v-model="expenseSearchQuery" label="Ausgaben durchsuchen" />
        </div>
        <div v-if="filteredExpenses.length" class="internal-scroll-list internal-scroll-list--expenses" :class="{ 'internal-scroll-list--scrollable': expenseListScrollable }">
          <ul
            ref="expenseList"
            class="expense-ledger ledger-list internal-scroll-list__viewport mt-3"
            aria-label="Ausgabenliste"
            :tabindex="expenseListScrollable ? 0 : undefined"
            @scroll="updateExpenseScrollState"
          >
            <li v-for="(expense, index) in filteredExpenses" :key="expense.id" class="min-w-0">
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
          <p v-if="expenseListHasMore" class="internal-scroll-list__cue" aria-hidden="true"><span>↓</span> Weitere Ausgaben</p>
        </div>
        <p v-else class="card mt-3 p-4 text-ink-700" role="status">Keine Ausgabe passt zu „{{ expenseSearchQuery.trim() }}“.</p>
      </section>

      <NuxtLink v-if="group.status === 'active'" :to="`/groups/${group.id}/expenses/new`" class="primary-button mt-6 w-full"><AppIcon name="plus" />Ausgabe hinzufügen</NuxtLink>

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
            <template v-else><p>„{{ group.name }}“ und {{ participants.length }} Teilnehmer endgültig löschen?</p><p>Diese Aktion kann nicht rückgängig gemacht werden.</p></template>
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
      <h1 class="text-3xl font-semibold">{{ t('group.notFound') }}</h1>
      <p class="mt-3 text-gray-600">Der lokale Gruppenstand ist in dieser Sitzung nicht vorhanden.</p>
      <NuxtLink to="/groups" class="primary-button mt-6">Zur Gruppenliste</NuxtLink>
    </div>
  </main>
</template>
