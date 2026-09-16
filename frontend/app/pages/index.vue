<script setup lang="ts">
const groupsStore = useGroupsStore()
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <header class="mb-8">
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm font-semibold tracking-wide text-brand-700">JoinSplit</p>
          <NuxtLink to="/settings" class="secondary-link -mr-4">Einstellungen</NuxtLink>
        </div>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Deine Gruppen</h1>
        <p class="mt-2 text-gray-600">Gemeinsame Ausgaben im Blick.</p>
      </header>

      <section v-if="groupsStore.groups.length" aria-labelledby="active-groups">
        <h2 id="active-groups" class="text-lg font-semibold">Aktive Gruppen</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="group in groupsStore.groups" :key="group.id" class="card">
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

      <section v-else class="card px-5 py-7 text-center" aria-labelledby="empty-groups">
        <h2 id="empty-groups" class="text-xl font-semibold">Noch keine Gruppe</h2>
        <p class="mt-2 text-gray-600">Starte eine Gruppe, um gemeinsame Ausgaben zu verwalten.</p>
      </section>

      <NuxtLink to="/groups/new" class="primary-button mt-6 w-full">Neue Gruppe</NuxtLink>
    </div>
  </main>
</template>
