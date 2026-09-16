<script setup lang="ts">
const route = useRoute()
const groupsStore = useGroupsStore()
const { online } = useConnectivity()
const heading = ref<HTMLHeadingElement | null>(null)
const groupId = computed(() => String(route.params.id))
const group = computed(() => groupsStore.findGroup(groupId.value))
const pending = computed(() => groupsStore.hasPendingCreate(groupId.value))

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

      <div class="mt-6 space-y-3">
        <p v-if="route.query.created === '1'" class="rounded-lg bg-brand-50 p-3 text-brand-900" role="status">
          Gruppe lokal erstellt.
        </p>
        <p v-if="pending" class="rounded-lg bg-amber-50 p-3 text-amber-950" role="status">
          Synchronisierung ausstehend. Die Gruppe ist lokal nutzbar.
        </p>
        <p v-if="!online" class="rounded-lg bg-gray-100 p-3 text-gray-800" role="status">
          Offline. Lokale Änderungen bleiben in dieser Sitzung nutzbar.
        </p>
      </div>

      <section class="card mt-7 px-5 py-8 text-center" aria-labelledby="empty-expenses">
        <h2 id="empty-expenses" class="text-xl font-semibold">Noch keine Ausgaben</h2>
        <p class="mt-2 text-gray-600">Erfasste Ausgaben erscheinen später hier.</p>
      </section>
    </div>

    <div v-else class="page-content">
      <h1 class="text-3xl font-semibold">Gruppe nicht gefunden</h1>
      <p class="mt-3 text-gray-600">Der lokale Gruppenstand ist in dieser Sitzung nicht vorhanden.</p>
      <NuxtLink to="/" class="primary-button mt-6">Zur Gruppenliste</NuxtLink>
    </div>
  </main>
</template>
