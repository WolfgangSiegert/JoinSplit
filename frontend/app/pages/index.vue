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
      <header class="mb-8">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-semibold tracking-wide text-brand-700">JoinSplit</p>
          <nav class="flex flex-wrap justify-end" aria-label="Allgemeine Navigation">
            <NuxtLink to="/demo" class="secondary-link">Demo & Daten</NuxtLink>
            <NuxtLink to="/settings" class="secondary-link -mr-4">Einstellungen</NuxtLink>
          </nav>
        </div>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Deine Gruppen</h1>
        <p class="mt-2 text-gray-600">Gemeinsame Ausgaben im Blick.</p>
      </header>

      <p v-if="route.query.deleted === '1'" class="mb-5 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Gruppe lokal zur endgültigen Löschung vorgemerkt.</p>
      <p v-if="route.query.reset === '1'" class="mb-5 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Lokale Daten wurden zurückgesetzt. Eine neue Browser-Identität wurde erstellt.</p>

      <section v-if="activeGroups.length" aria-labelledby="active-groups">
        <h2 id="active-groups" class="text-lg font-semibold">Aktive Gruppen</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="group in activeGroups" :key="group.id" class="card">
            <NuxtLink
              :to="`/groups/${group.id}`"
              class="flex min-h-14 items-center justify-between rounded-2xl px-4 py-3 font-semibold"
            >
              <span>{{ group.name }}</span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="!activeGroups.length && !archivedGroups.length && !pendingDeletions.length" class="card px-5 py-7 text-center" aria-labelledby="empty-groups">
        <h2 id="empty-groups" class="text-xl font-semibold">Noch keine Gruppe</h2>
        <p class="mt-2 text-gray-600">Starte eine Gruppe, um gemeinsame Ausgaben zu verwalten.</p>
      </section>

      <section v-if="archivedGroups.length" class="mt-6" aria-labelledby="archived-groups-title">
        <label class="flex min-h-11 items-center gap-3 font-medium">
          <input v-model="showArchived" type="checkbox" class="size-5">
          Archivierte Gruppen anzeigen
        </label>
        <div v-if="showArchived" class="mt-3">
          <h2 id="archived-groups-title" class="text-lg font-semibold">Archivierte Gruppen</h2>
          <ul class="mt-3 space-y-3">
            <li v-for="group in archivedGroups" :key="group.id" class="card">
              <NuxtLink :to="`/groups/${group.id}`" class="flex min-h-14 items-center justify-between rounded-2xl px-4 py-3 font-semibold">
                <span>{{ group.name }}</span><span aria-hidden="true">→</span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="pendingDeletions.length" class="mt-6" aria-labelledby="pending-deletions-title">
        <h2 id="pending-deletions-title" class="text-lg font-semibold">Ausstehende Löschungen</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="item in pendingDeletions" :key="item.mutation.id" class="card p-4">
            <p class="font-semibold">{{ item.group!.name }}</p>
            <GroupSyncStatus :group-id="item.mutation.groupId" pending-deletion class="mt-3" />
          </li>
        </ul>
      </section>

      <NuxtLink to="/groups/new" class="primary-button mt-6 w-full">Neue Gruppe</NuxtLink>
    </div>
  </main>
</template>
