<script setup lang="ts">
const groupsStore = useGroupsStore()
const peopleStore = usePeopleStore()
const route = useRoute()
const showArchived = ref(false)
const activeGroups = computed(() => groupsStore.visibleGroups.filter(group => group.status === 'active'))
const archivedGroups = computed(() => groupsStore.visibleGroups.filter(group => group.status === 'archived'))
const pendingDeletions = computed(() => groupsStore.pendingGroupDeletions.map(mutation => ({
  mutation,
  group: groupsStore.findStoredGroup(mutation.groupId),
})).filter(item => item.group))
const isFreshStart = computed(() => !activeGroups.value.length && !archivedGroups.value.length && !pendingDeletions.value.length)
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <header class="landing-header">
        <div class="landing-hero">
          <p class="eyebrow">Gemeinsame Ausgaben. Klar geregelt.</p>
          <h1 class="landing-hero__title">Gemeinsam den Überblick behalten</h1>
          <p class="landing-hero__lead">Mehr zusammen erleben. Weniger rechnen.</p>
          <p class="landing-hero__copy">JoinSplit hält fest, wer bezahlt hat, teilt Ausgaben fair auf und zeigt, wie ihr euch mit wenigen Zahlungen ausgleicht.</p>
          <div class="landing-hero__actions">
            <NuxtLink v-if="isFreshStart" to="/groups/new" class="primary-button" aria-label="Neue Gruppe starten"><AppIcon name="plus" />Erste Gruppe starten</NuxtLink>
            <NuxtLink v-else to="/groups" class="primary-button"><AppIcon name="users" />Zu meinen Gruppen</NuxtLink>
            <NuxtLink to="/people#person-form" class="secondary-button"><AppIcon name="user" />Person anlegen</NuxtLink>
          </div>
        </div>
        <JoinSplitOverviewGraphic />
      </header>

      <nav class="landing-workspaces" aria-label="Deine Bereiche">
        <NuxtLink to="/groups" class="landing-workspace-card">
          <span class="landing-workspace-card__icon"><AppIcon name="users" /></span>
          <span><strong>Meine Gruppen</strong><small>{{ activeGroups.length }} aktiv</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
        <NuxtLink to="/people" class="landing-workspace-card">
          <span class="landing-workspace-card__icon"><AppIcon name="user" /></span>
          <span><strong>Meine Personen</strong><small>{{ peopleStore.activePeople.length }} aktiv</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
      </nav>

      <p v-if="route.query.deleted === '1'" class="mb-5 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Gruppe lokal zur endgültigen Löschung vorgemerkt.</p>
      <p v-if="route.query.reset === '1'" class="mb-5 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Lokale Daten wurden zurückgesetzt. Eine neue Browser-Identität wurde erstellt.</p>

      <section id="gruppen" class="landing-groups" aria-labelledby="group-selector-title">
        <p class="eyebrow">Dein Bereich</p>
        <h2 id="group-selector-title" class="mt-2 text-3xl font-bold">Meine Gruppen</h2>
        <p class="mt-2 text-ink-700">Öffne eine bestehende Gruppe oder starte einen neuen gemeinsamen Stand.</p>

        <section v-if="activeGroups.length" class="mt-6" aria-labelledby="active-groups">
          <h3 id="active-groups" class="text-lg font-semibold">Aktive Gruppen</h3>
          <ul class="ledger-list mt-3">
            <li v-for="(group, index) in activeGroups" :key="group.id">
              <NuxtLink
                :to="`/groups/${group.id}`"
                class="ledger-row font-semibold"
              >
                <ParticipantAvatar :name="group.name" :index="index" size="lg" />
                <span class="min-w-0 flex-1"><span class="block break-words font-bold">{{ group.name }}</span><span class="mt-1 block text-sm font-medium text-ink-700">Aktiv · {{ group.currency }}</span></span>
                <span class="text-xl" aria-hidden="true">›</span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <p v-else class="card mt-6 p-5 text-center">
          {{ isFreshStart
            ? 'Noch keine Gruppe auf diesem Gerät. Du kannst sofort lokal starten.'
            : 'Keine aktive Gruppe. Archivierte Gruppen und ausstehende Löschungen bleiben unten erreichbar.' }}
        </p>

        <section v-if="archivedGroups.length" class="mt-6" aria-labelledby="archived-groups-title">
          <label class="flex min-h-11 items-center gap-3 font-medium">
            <input v-model="showArchived" type="checkbox" class="size-5">
            Archivierte Gruppen anzeigen
          </label>
          <div v-if="showArchived" class="mt-3">
            <h3 id="archived-groups-title" class="text-lg font-semibold">Archivierte Gruppen</h3>
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
          <h3 id="pending-deletions-title" class="text-lg font-semibold">Ausstehende Löschungen</h3>
          <ul class="mt-3 space-y-3">
            <li v-for="item in pendingDeletions" :key="item.mutation.id" class="card p-4">
              <p class="font-semibold">{{ item.group!.name }}</p>
              <GroupSyncStatus :group-id="item.mutation.groupId" pending-deletion class="mt-3" />
            </li>
          </ul>
        </section>

        <NuxtLink to="/groups/new" class="primary-button mt-7 w-full"><AppIcon name="plus" />{{ isFreshStart ? 'Erste Gruppe starten' : 'Neue Gruppe starten' }}</NuxtLink>
      </section>

      <section id="so-funktionierts" class="landing-guide mt-8" aria-labelledby="landing-guide-title">
        <p class="eyebrow">In drei Schritten</p>
        <h2 id="landing-guide-title" class="mt-2 text-2xl font-bold">Von der ersten Ausgabe zum klaren Ausgleich</h2>
        <ol class="landing-guide__list">
          <li><strong>Gruppe anlegen</strong><span>Mit erfundenen Namen starten und Personen jederzeit ergänzen.</span></li>
          <li><strong>Ausgaben erfassen</strong><span>Betrag und zahlende Person wählen – JoinSplit verteilt auf Cent genau.</span></li>
          <li><strong>Salden ausgleichen</strong><span>Offene Beträge sehen und tatsächliche Zahlungen dokumentieren.</span></li>
        </ol>
        <p class="landing-guide__note">Ohne Registrierung. Die Daten bleiben in diesem Browser verfügbar und werden bei Verbindung mit der Demo synchronisiert.</p>
      </section>
    </div>
  </main>
</template>
