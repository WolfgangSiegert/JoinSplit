<script setup lang="ts">
import { normalizeName } from '../../../domain/create-group'
import { participantHasFinancialReferences } from '../../../domain/expense'
import { participantHasSettlementReferences } from '../../../domain/settlement'
import { hasDuplicateParticipantName } from '../../../domain/participant'
import { calculateParticipantBalances, formatSignedAmountMinor } from '../../../domain/balance'

const route = useRoute()
const groupsStore = useGroupsStore()
const peopleStore = usePeopleStore()
const { locale, t } = useAppI18n()
const { add, rename, deactivate, reactivate, associate, remove } = useParticipants()
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const participants = computed(() => groupsStore.participantsForGroup(groupId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const settlements = computed(() => groupsStore.settlementsForGroup(groupId.value))
const balances = computed(() => calculateParticipantBalances(groupId.value, participants.value, expenses.value, settlements.value))
const balanceByParticipant = computed(() => new Map(balances.value.map(balance => [balance.participantId, balance.balanceAmountMinor])))
const largestAbsoluteBalance = computed(() => balances.value.reduce((largest, balance) => {
  const absolute = balance.balanceAmountMinor < 0n ? -balance.balanceAmountMinor : balance.balanceAmountMinor
  return absolute > largest ? absolute : largest
}, 0n))
const participantSearch = ref('')
const filteredParticipants = computed(() => {
  const query = participantSearch.value.trim().toLocaleLowerCase(locale.value)
  if (!query) return participants.value

  return participants.value.filter((participant) => {
    const linkedPersonName = participant.personId
      ? peopleStore.people.find(person => person.id === participant.personId)?.name ?? ''
      : ''
    return `${participant.name} ${linkedPersonName}`.toLocaleLowerCase(locale.value).includes(query)
  })
})
const addName = ref('')
const selectedPersonId = ref('')
const associationSelection = reactive<Record<string, string>>({})
const addError = ref('')
const status = ref('')
const statusIsError = ref(false)
const addInput = ref<HTMLInputElement | null>(null)
const addPanelOpen = ref(route.hash === '#participant-form')
const addPanel = ref<HTMLElement | null>(null)
const addPanelToggle = ref<HTMLButtonElement | null>(null)
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
  await nextTick()
  if (route.hash === '#participant-form') {
    addPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    addInput.value?.focus()
  }
})

function participantState(amount: bigint): string {
  if (amount > 0n) return t('group.people.state.receives')
  if (amount < 0n) return t('group.people.state.pays')
  return t('group.people.state.settled')
}

function balanceTone(amount: bigint): 'positive' | 'negative' | 'neutral' {
  if (amount > 0n) return 'positive'
  if (amount < 0n) return 'negative'
  return 'neutral'
}

function balanceBarWidth(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount
  if (largestAbsoluteBalance.value === 0n) return '0%'
  return `${Math.max(6, Number((absolute * 50n) / largestAbsoluteBalance.value))}%`
}

async function toggleAddPanel(): Promise<void> {
  addPanelOpen.value = !addPanelOpen.value
  await nextTick()
  if (addPanelOpen.value) {
    addPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    addInput.value?.focus()
  } else {
    addPanelToggle.value?.focus()
  }
}

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
    addName.value = ''; status.value = t('group.people.status.added', { name: result.value.participant.name })
    restoreAddFocus = true
  } catch { status.value = t('group.people.status.addFailed'); statusIsError.value = true; restoreAddFocus = true }
  finally {
    busyAction.value = null
    if (restoreAddFocus) { await nextTick(); addInput.value?.focus() }
  }
}

async function addSelectedPerson(): Promise<void> {
  if (busyAction.value || !selectedPersonId.value) return
  const person = peopleStore.people.find(item => item.id === selectedPersonId.value && item.status === 'active')
  if (!person) { status.value = t('group.people.status.personUnavailable'); statusIsError.value = true; return }
  busyAction.value = 'add-person'
  status.value = ''
  statusIsError.value = false
  try {
    const result = await add(groupId.value, person.name, person.id)
    if (!result.ok) { status.value = result.errors.name ?? t('group.people.status.personAddFailed'); statusIsError.value = true; return }
    selectedPersonId.value = ''
    status.value = t('group.people.status.personAdded', { name: person.name })
  } catch {
    status.value = t('group.people.status.personLinkFailed')
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
      ? t('group.people.status.linked', { name: person.name })
      : t('group.people.status.unlinked')
  } catch {
    status.value = t('group.people.status.linkFailed')
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

async function toggleRename(id: string, name: string): Promise<void> {
  if (editingId.value !== id) {
    await startRename(id, name)
    return
  }

  await cancelRename(id)
  const details = detailsByParticipant.get(id)
  if (details) details.open = false
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
    editingId.value = null; status.value = t('group.people.status.renamed', { name: result.value.participant.name })
    busyAction.value = null
    await nextTick(); renameTriggerByParticipant.get(id)?.focus()
  } catch { status.value = t('group.people.status.renameFailed'); statusIsError.value = true }
  finally { busyAction.value = null }
}
async function submitDeactivate(id: string, name: string) {
  if (busyAction.value) return
  busyAction.value = `deactivate:${id}`
  statusIsError.value = false
  try { await deactivate(id); status.value = t('group.people.status.deactivated', { name }) }
  catch { status.value = t('group.people.status.deactivateFailed'); statusIsError.value = true }
  finally { busyAction.value = null }
}
async function submitReactivate(id: string, name: string) {
  if (busyAction.value) return
  busyAction.value = `reactivate:${id}`
  statusIsError.value = false
  try { await reactivate(id); status.value = t('group.people.status.reactivated', { name }) }
  catch { status.value = t('group.people.status.reactivateFailed'); statusIsError.value = true }
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
    status.value = t('group.people.status.deleted', { name: target.name })
    busyAction.value = null
    await nextTick()
    const nextSummary = nextFocus ? summaryByParticipant.get(nextFocus) : undefined
    if (nextSummary) nextSummary.focus(); else addInput.value?.focus()
  } catch { status.value = t('group.people.status.deleteFailed'); statusIsError.value = true; busyAction.value = null; closeDelete() }
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
      <NuxtLink :to="`/groups/${group.id}`" class="secondary-link -ml-4 mb-3" :aria-label="`← ${t('group.back.group')}`"><AppIcon name="arrow-left" />{{ t('group.back.group') }}</NuxtLink>
      <header class="group-view-heading">
        <p class="group-view-heading__group-meta">
          <strong class="group-view-heading__group-name">{{ group.name }}</strong>
          <span aria-hidden="true">•</span>
          <span>{{ participants.length }} {{ participants.length === 1 ? t('group.meta.person') : t('group.meta.people') }}</span>
          <span aria-hidden="true">•</span>
          <span>{{ group.currency }}</span>
        </p>
        <div class="group-view-heading__title-row">
          <h1 class="text-4xl font-bold text-brand-900">{{ t('group.people.title') }}</h1>
          <GroupSyncStatus :group-id="group.id" mobile-collapsible class="group-view-heading__sync" />
        </div>
        <p class="mt-2 text-ink-700">{{ t('group.people.lead') }}</p>
        <p class="group-view-heading__description mt-2 text-sm text-ink-700">{{ t('group.people.copy') }}</p>
      </header>

      <GroupAreaNavigation :group-id="group.id" />

      <p v-if="group.status === 'archived'" class="card mt-6 p-4">
        {{ t('group.people.archived') }}
      </p>

      <div v-if="group.status === 'active'" class="participant-add-control">
        <button
          ref="addPanelToggle"
          type="button"
          class="icon-button"
          :aria-expanded="addPanelOpen"
          aria-controls="participant-form"
          :aria-label="addPanelOpen ? t('group.people.add.close') : t('group.people.add.open')"
          :title="addPanelOpen ? t('common.close') : t('group.people.add.label')"
          @click="toggleAddPanel"
        ><AppIcon :name="addPanelOpen ? 'x' : 'plus'" /></button>
      </div>

      <section v-if="group.status === 'active' && addPanelOpen" id="participant-form" ref="addPanel" class="participant-add-panel card scroll-mt-28 p-5" aria-labelledby="participant-add-title">
        <h2 id="participant-add-title" class="text-xl font-bold">{{ t('group.people.add.title') }}</h2>
        <form class="mt-4" :aria-busy="busyAction === 'add'" @submit.prevent="submitAdd()">
          <label for="participant-name" class="font-semibold">{{ t('group.people.add.label') }}</label>
          <input id="participant-name" ref="addInput" v-model="addName" class="field-input mt-2" :disabled="Boolean(busyAction)" :aria-invalid="Boolean(addError)" :aria-describedby="addError ? 'add-error' : undefined">
          <p v-if="addError" id="add-error" class="error-text mt-2">{{ addError }}</p>
          <div v-if="duplicateWarning?.kind === 'add'" class="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950" role="alert">
            <p class="font-semibold">{{ t('group.people.duplicate.title') }}</p>
            <p class="mt-1">{{ t('group.people.duplicate.copy', { name: duplicateWarning.name }) }}</p>
            <button ref="duplicateConfirmButton" type="button" class="secondary-button mt-3" :disabled="Boolean(busyAction)" @click="submitAdd(true)">{{ t('group.people.duplicate.add') }}</button>
          </div>
          <button type="submit" class="primary-button mt-3 w-full" :disabled="Boolean(busyAction)"><AppIcon name="plus" />{{ busyAction === 'add' ? t('group.people.add.pending') : t('group.people.add.submit') }}</button>
        </form>

        <div class="participant-add-panel__known" aria-labelledby="add-known-person-title">
          <h3 id="add-known-person-title" class="font-semibold">{{ t('group.people.directory.title') }}</h3>
          <template v-if="peopleStore.activePeople.length">
            <label for="known-person" class="mt-3 block font-medium">{{ t('common.person') }}</label>
            <select id="known-person" v-model="selectedPersonId" class="field-input mt-2" :disabled="Boolean(busyAction) || !availablePeople.length">
              <option value="">{{ t('group.people.directory.select') }}</option>
              <option v-for="person in availablePeople" :key="person.id" :value="person.id">{{ person.name }}</option>
            </select>
            <p v-if="!availablePeople.length" class="mt-2 text-sm text-gray-600">{{ t('group.people.directory.allAssigned') }}</p>
            <button type="button" class="secondary-button mt-3 w-full" :disabled="Boolean(busyAction) || !selectedPersonId" @click="addSelectedPerson"><AppIcon name="users" />{{ busyAction === 'add-person' ? t('group.people.add.pending') : t('group.people.directory.add') }}</button>
          </template>
          <p v-else class="mt-2 text-sm text-gray-600">{{ t('group.people.directory.empty') }}</p>
          <NuxtLink to="/people" class="secondary-link mt-3 -ml-4"><AppIcon name="arrow-right" />{{ t('group.people.directory.open') }}</NuxtLink>
        </div>
      </section>

      <p v-if="statusIsError" class="error-text mt-4" role="alert">{{ status }}</p>
      <p v-else class="sr-only" role="status" aria-live="polite">{{ status }}</p>
      <p v-if="!participants.length" class="card mt-6 p-5 text-center">{{ t('group.people.empty') }}</p>
      <section v-else class="participant-list-section mt-6" aria-labelledby="participant-list-title">
        <div class="list-section-heading">
          <div>
            <h2 id="participant-list-title" class="text-2xl font-bold">{{ t('group.people.overview') }}</h2>
            <p class="mt-1 text-sm text-ink-700">{{ participants.length }} {{ participants.length === 1 ? t('common.person') : t('common.people') }}</p>
          </div>
          <ListSearch v-model="participantSearch" :label="t('group.people.search')" />
        </div>
        <p v-if="!filteredParticipants.length" class="card mt-4 p-5 text-center">{{ t('group.people.search.empty', { query: participantSearch.trim() }) }}</p>
        <div v-if="filteredParticipants.length" class="balance-overview__legend participant-list__legend" aria-hidden="true">
          <span class="balance-overview__legend-negative">{{ t('group.people.legend.pays') }}</span>
          <span class="balance-overview__legend-zero">0</span>
          <span class="balance-overview__legend-positive">{{ t('group.people.legend.receives') }}</span>
        </div>
        <ul v-if="filteredParticipants.length" class="participant-list mt-2" :aria-label="t('group.people.list')" :aria-busy="Boolean(busyAction)">
          <li v-for="participant in filteredParticipants" :key="participant.id" class="participant-list__item">
            <details :ref="(element) => { if (element) detailsByParticipant.set(participant.id, element as HTMLDetailsElement); else detailsByParticipant.delete(participant.id) }" class="participant-entry">
              <summary :ref="(element) => { if (element) summaryByParticipant.set(participant.id, element as HTMLElement); else summaryByParticipant.delete(participant.id) }" class="participant-entry__summary" :aria-label="t('group.people.details.label', { name: participant.name })">
                <ParticipantAvatar :name="participant.name" :index="participants.findIndex(item => item.id === participant.id)" size="lg" />
                <span class="participant-entry__identity">
                  <span class="participant-entry__name-row">
                    <strong>{{ participant.name }}</strong>
                    <span class="participant-entry__amount" :class="`balance-overview__amount--${balanceTone(balanceByParticipant.get(participant.id) ?? 0n)}`">{{ formatSignedAmountMinor(balanceByParticipant.get(participant.id) ?? 0n) }}</span>
                  </span>
                  <span class="participant-entry__status"><span>{{ participant.status === 'active' ? t('group.people.status.activeLabel') : t('group.people.status.inactiveLabel') }}{{ participant.personId ? t('group.people.directory.linkedSuffix') : '' }}</span><span aria-hidden="true"> · </span><strong :class="`balance-overview__state--${balanceTone(balanceByParticipant.get(participant.id) ?? 0n)}`">{{ participantState(balanceByParticipant.get(participant.id) ?? 0n) }}</strong></span>
                  <span class="balance-overview__track participant-entry__balance" aria-hidden="true">
                    <span class="balance-overview__zero" />
                    <span v-if="(balanceByParticipant.get(participant.id) ?? 0n) !== 0n" class="balance-overview__bar" :class="`balance-overview__bar--${balanceTone(balanceByParticipant.get(participant.id) ?? 0n)}`" :style="{ '--balance-size': balanceBarWidth(balanceByParticipant.get(participant.id) ?? 0n) }" />
                    <span v-else class="balance-overview__neutral-dot" />
                  </span>
                </span>
                <span class="participant-entry__toggle" aria-hidden="true"><span>{{ t('common.details') }}</span><AppIcon name="chevron-down" /></span>
              </summary>
              <div class="participant-entry__content">
                <div v-if="group.status === 'active' && editingId !== participant.id" class="participant-entry__mobile-actions" :aria-label="t('group.people.quickActions')">
                  <button type="button" class="secondary-button" :disabled="Boolean(busyAction)" @click="startRename(participant.id, participant.name)"><AppIcon name="pencil" />{{ t('group.people.rename.title') }}</button>
                  <button v-if="participant.status === 'active'" type="button" class="secondary-button" :disabled="Boolean(busyAction)" @click="submitDeactivate(participant.id, participant.name)"><AppIcon name="user-minus" />{{ t('group.people.deactivate.title') }}</button>
                  <button v-else type="button" class="secondary-button" :disabled="Boolean(busyAction)" @click="submitReactivate(participant.id, participant.name)"><AppIcon name="refresh" />{{ t('group.people.reactivate.title') }}</button>
                </div>
                <form v-if="group.status === 'active' && editingId === participant.id" class="mt-3" :aria-busy="busyAction === `rename:${participant.id}`" @submit.prevent="submitRename(participant.id)">
                  <label :for="`rename-${participant.id}`" class="font-semibold">{{ t('group.people.rename.label') }}</label>
                  <input :id="`rename-${participant.id}`" :ref="(element) => { if (element) renameInputByParticipant.set(participant.id, element as HTMLInputElement); else renameInputByParticipant.delete(participant.id) }" v-model="editName" class="field-input mt-2" :disabled="Boolean(busyAction)" :aria-invalid="Boolean(editError)" :aria-describedby="editError ? `rename-${participant.id}-error` : undefined">
                  <p v-if="editError" :id="`rename-${participant.id}-error`" class="error-text mt-2">{{ editError }}</p>
                  <div v-if="duplicateWarning?.kind === 'rename' && duplicateWarning.participantId === participant.id" class="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950" role="alert">
                    <p class="font-semibold">{{ t('group.people.duplicate.title') }}</p>
                    <p class="mt-1">{{ t('group.people.duplicate.copy', { name: duplicateWarning.name }) }}</p>
                    <button :ref="(element) => { if (element) duplicateRenameConfirmByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="secondary-button mt-3" :disabled="Boolean(busyAction)" @click="submitRename(participant.id, true)">{{ t('group.people.duplicate.rename') }}</button>
                  </div>
                  <div class="mt-3 flex gap-2"><button class="primary-button" type="submit" :disabled="Boolean(busyAction)"><AppIcon name="save" />{{ busyAction === `rename:${participant.id}` ? t('common.saving') : t('common.save') }}</button><button class="secondary-button" type="button" :disabled="Boolean(busyAction)" @click="cancelRename(participant.id)">{{ t('common.cancel') }}</button></div>
                </form>
                <div v-else-if="group.status === 'active' && !hasFinancialReferences(participant.id)" class="participant-entry__actions mt-3">
                  <button v-if="!hasFinancialReferences(participant.id)" :ref="(element) => { if (element) triggerByParticipant.set(participant.id, element as HTMLButtonElement) }" type="button" class="danger-button" :disabled="Boolean(busyAction)" :aria-label="t('group.people.delete.action', { name: participant.name })" @click="askDelete(participant.id, $event.currentTarget as HTMLButtonElement)"><AppIcon name="trash" />{{ t('common.delete') }}</button>
                </div>
                <div v-if="group.status === 'active'" class="mt-3 rounded-xl border border-gray-200 p-3">
                  <template v-if="participant.personId">
                    <p class="text-sm text-ink-700">{{ t('group.people.link.current', { name: peopleStore.people.find(person => person.id === participant.personId)?.name ?? participant.name }) }}</p>
                    <button type="button" class="secondary-button mt-3 w-full" :disabled="Boolean(busyAction)" :aria-label="t('group.people.link.removeLabel', { name: participant.name })" @click="updateAssociation(participant.id, null)"><AppIcon name="unlink" />{{ busyAction === `associate:${participant.id}` ? t('group.people.link.removing') : t('group.people.link.remove') }}</button>
                  </template>
                  <template v-else-if="availablePeople.length">
                    <label :for="`associate-${participant.id}`" class="block text-sm font-semibold">{{ t('group.people.link.title') }}</label>
                    <select :id="`associate-${participant.id}`" v-model="associationSelection[participant.id]" class="field-input mt-2" :disabled="Boolean(busyAction)">
                      <option value="">{{ t('group.people.directory.select') }}</option>
                      <option v-for="person in availablePeople" :key="person.id" :value="person.id">{{ person.name }}</option>
                    </select>
                    <button type="button" class="secondary-button mt-3 w-full" :disabled="Boolean(busyAction) || !associationSelection[participant.id]" @click="updateAssociation(participant.id, associationSelection[participant.id]!)"><AppIcon name="link" />{{ busyAction === `associate:${participant.id}` ? t('group.people.link.pending') : t('group.people.link.submit') }}</button>
                  </template>
                  <p v-else class="text-sm text-gray-600">{{ t('group.people.link.none') }}</p>
                </div>
                <p v-if="group.status === 'active' && hasFinancialReferences(participant.id) && participant.status === 'active'" class="mt-3 text-sm text-gray-600">{{ t('group.people.financial.active') }}</p>
                <p v-else-if="group.status === 'active' && hasFinancialReferences(participant.id)" class="mt-3 text-sm text-gray-600">{{ t('group.people.financial.inactive') }}</p>
              </div>
            </details>
            <div v-if="group.status === 'active'" class="participant-entry__quick-actions" :aria-label="t('group.people.quickActions')">
              <button :ref="(element) => { if (element) renameTriggerByParticipant.set(participant.id, element as HTMLButtonElement); else renameTriggerByParticipant.delete(participant.id) }" type="button" class="icon-button participant-entry__quick-action" :disabled="Boolean(busyAction)" :aria-label="editingId === participant.id ? t('group.people.rename.close', { name: participant.name }) : t('group.people.rename.action', { name: participant.name })" :aria-pressed="editingId === participant.id" :title="editingId === participant.id ? t('group.people.rename.closeTitle') : t('group.people.rename.title')" @click="toggleRename(participant.id, participant.name)"><AppIcon name="pencil" /></button>
              <button v-if="participant.status === 'active'" type="button" class="icon-button participant-entry__quick-action" :disabled="Boolean(busyAction)" :aria-label="t('group.people.deactivate.action', { name: participant.name })" :title="t('group.people.deactivate.title')" @click="submitDeactivate(participant.id, participant.name)"><AppIcon name="user-minus" /></button>
              <button v-else type="button" class="icon-button participant-entry__quick-action" :disabled="Boolean(busyAction)" :aria-label="t('group.people.reactivate.action', { name: participant.name })" :title="t('group.people.reactivate.title')" @click="submitReactivate(participant.id, participant.name)"><AppIcon name="refresh" /></button>
            </div>
          </li>
        </ul>
      </section>

      <dialog ref="deleteDialog" aria-labelledby="delete-title" class="delete-dialog rounded-2xl p-0" :aria-busy="busyAction?.startsWith('delete:')" @cancel.prevent="closeDelete">
        <div class="p-5">
          <h2 id="delete-title" class="text-xl font-semibold">{{ t('group.people.delete.title') }}</h2>
          <p class="mt-3">{{ t('group.people.delete.confirm', { name: deleteTarget?.name ?? '' }) }}</p>
          <div class="mt-5 flex gap-2"><button type="button" class="secondary-button" :disabled="Boolean(busyAction)" @click="closeDelete">{{ t('common.cancel') }}</button><button ref="deleteButton" type="button" class="danger-button" :disabled="Boolean(busyAction)" @click="confirmDelete">{{ busyAction?.startsWith('delete:') ? t('common.deleting') : t('group.people.delete.final') }}</button></div>
        </div>
      </dialog>
    </div>
    <div v-else class="page-content"><h1 class="text-3xl font-semibold">{{ t('group.notFound') }}</h1></div>
  </main>
</template>
