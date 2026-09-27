<script setup lang="ts">
const groupsStore = useGroupsStore()
const route = useRoute()
const showArchived = ref(false)
const activeGroups = computed(() => groupsStore.visibleGroups.filter(group => group.status === 'active'))
const archivedGroups = computed(() => groupsStore.visibleGroups.filter(group => group.status === 'archived'))
const pendingDeletions = computed(() => groupsStore.pendingGroupDeletions.map(mutation => ({
  mutation,
  group: groupsStore.findStoredGroup(mutation.groupId),
})).filter(item => item.group))
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <header>
        <p class="eyebrow">Dein Bereich</p>
        <h1 class="mt-2 text-4xl font-bold">Meine Gruppen</h1>
        <p class="mt-2 text-ink-700">Öffne eine bestehende Gruppe oder starte einen neuen gemeinsamen Stand.</p>
      </header>

      <p v-if="route.query.deleted === '1'" class="status-panel mt-5 border-brand-100 bg-brand-50 text-brand-900" role="status">Gruppe lokal zur endgültigen Löschung vorgemerkt.</p>

      <section v-if="activeGroups.length" class="mt-6" aria-labelledby="active-groups-title">
        <div class="flex items-end justify-between gap-3">
          <h2 id="active-groups-title" class="text-xl font-bold">Aktive Gruppen</h2>
          <span class="text-sm text-ink-700">{{ activeGroups.length }}</span>
        </div>
        <ul class="ledger-list mt-3">
          <li v-for="(group, index) in activeGroups" :key="group.id">
            <NuxtLink :to="`/groups/${group.id}`" class="ledger-row">
              <ParticipantAvatar :name="group.name" :index="index" size="lg" />
              <span class="min-w-0 flex-1">
                <strong class="block break-words">{{ group.name }}</strong>
                <span class="mt-1 block text-sm text-ink-700">Aktiv · {{ group.currency }}</span>
              </span>
              <AppIcon name="chevron-right" />
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-else class="card mt-6 p-5 text-center" aria-labelledby="empty-groups-title">
        <h2 id="empty-groups-title" class="text-xl font-bold">Noch keine aktive Gruppe</h2>
        <p class="mt-2 text-ink-700">Du kannst sofort lokal und ohne Registrierung starten.</p>
        <NuxtLink to="/groups/new" class="primary-button mt-4"><AppIcon name="plus" />Erste Gruppe starten</NuxtLink>
      </section>

      <section v-if="archivedGroups.length" class="mt-7" aria-labelledby="archived-groups-title">
        <label class="flex min-h-11 items-center gap-3 font-medium">
          <input v-model="showArchived" type="checkbox" class="size-5">
          Archivierte Gruppen anzeigen
        </label>
        <ul v-if="showArchived" class="ledger-list mt-3">
          <li v-for="group in archivedGroups" :key="group.id">
            <NuxtLink :to="`/groups/${group.id}`" class="ledger-row">
              <span class="min-w-0 flex-1"><strong class="block break-words">{{ group.name }}</strong><span class="mt-1 block text-sm text-ink-700">Archiviert · {{ group.currency }}</span></span>
              <AppIcon name="chevron-right" />
            </NuxtLink>
          </li>
        </ul>
        <h2 id="archived-groups-title" class="sr-only">Archivierte Gruppen</h2>
      </section>

      <section v-if="pendingDeletions.length" class="mt-7" aria-labelledby="pending-deletions-title">
        <h2 id="pending-deletions-title" class="text-xl font-bold">Ausstehende Löschungen</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="item in pendingDeletions" :key="item.mutation.id" class="card p-4">
            <p class="font-semibold">{{ item.group!.name }}</p>
            <GroupSyncStatus :group-id="item.mutation.groupId" pending-deletion class="mt-3" />
          </li>
        </ul>
      </section>

      <NuxtLink v-if="activeGroups.length" to="/groups/new" class="primary-button mt-7 w-full"><AppIcon name="plus" />Neue Gruppe starten</NuxtLink>
    </div>
  </main>
</template>
