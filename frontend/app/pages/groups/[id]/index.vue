<script setup lang="ts">
import { formatAmountMinor } from '../../../domain/expense'
const route = useRoute()
const groupsStore = useGroupsStore()
const heading = ref<HTMLHeadingElement | null>(null)
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const expenses = computed(() => groupsStore.expensesForGroup(groupId.value))
const participantNames = computed(() => new Map(groupsStore.participantsForGroup(groupId.value).map(item => [item.id, item.name])))

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

    </div>

    <div v-else class="page-content">
      <h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1>
      <p class="mt-3 text-gray-600">Der lokale Gruppenstand ist in dieser Sitzung nicht vorhanden.</p>
      <NuxtLink to="/" class="primary-button mt-6">Zur Gruppenliste</NuxtLink>
    </div>
  </main>
</template>
