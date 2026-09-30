<script setup lang="ts">
const groupsStore = useGroupsStore()
const peopleStore = usePeopleStore()
const route = useRoute()
const { t } = useAppI18n()
const { groupStartPath } = useGroupStartPath()
const showArchived = ref(false)
const activeGroups = computed(() => groupsStore.visibleGroups.filter(group => group.status === 'active'))
const archivedGroups = computed(() => groupsStore.visibleGroups.filter(group => group.status === 'archived'))
const pendingDeletions = computed(() => groupsStore.pendingGroupDeletions.map(mutation => ({
  mutation,
  group: groupsStore.findStoredGroup(mutation.groupId),
})).filter(item => item.group))
const isFreshStart = computed(() => !activeGroups.value.length && !archivedGroups.value.length && !pendingDeletions.value.length)

function scrollToOverview(event: MouseEvent): void {
  const overview = document.getElementById('so-funktionierts')
  if (!overview) return

  event.preventDefault()
  overview.scrollIntoView({
    block: 'center',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <header class="landing-header">
        <div class="landing-hero">
          <p class="eyebrow">{{ t('home.eyebrow') }}</p>
          <h1 class="landing-hero__title">{{ t('home.title') }}</h1>
          <p class="landing-hero__lead">{{ t('home.lead') }}</p>
          <p class="landing-hero__copy">{{ t('home.copy') }}</p>
          <a href="#so-funktionierts" class="landing-hero__guide-link" @click="scrollToOverview">{{ t('home.how') }}<AppIcon name="chevron-down" /></a>
          <div class="landing-hero__actions">
            <NuxtLink v-if="isFreshStart" to="/groups/new" class="primary-button" :aria-label="t('home.newGroup')"><AppIcon name="plus" />{{ t('home.firstGroup') }}</NuxtLink>
            <NuxtLink v-else to="/groups" class="primary-button"><AppIcon name="users" />{{ t('home.myGroups') }}</NuxtLink>
            <NuxtLink to="/people#person-form" class="secondary-button"><AppIcon name="user" />{{ t('home.addPerson') }}</NuxtLink>
          </div>
        </div>
        <JoinSplitOverviewGraphic id="so-funktionierts" />
      </header>

      <nav class="landing-workspaces" :aria-label="t('home.workspaces')">
        <NuxtLink to="/groups" class="landing-workspace-card">
          <span class="landing-workspace-card__icon"><AppIcon name="users" /></span>
          <span><strong>{{ t('home.groups') }}</strong><small>{{ activeGroups.length }} {{ t('common.active') }}</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
        <NuxtLink to="/people" class="landing-workspace-card">
          <span class="landing-workspace-card__icon"><AppIcon name="user" /></span>
          <span><strong>{{ t('home.people') }}</strong><small>{{ peopleStore.activePeople.length }} {{ t('common.active') }}</small></span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
      </nav>

      <p v-if="route.query.deleted === '1'" class="mb-5 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Gruppe lokal zur endgültigen Löschung vorgemerkt.</p>
      <p v-if="route.query.reset === '1'" class="mb-5 rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Lokale Daten wurden zurückgesetzt. Eine neue Browser-Identität wurde erstellt.</p>

      <section id="gruppen" class="landing-groups" aria-labelledby="group-selector-title">
        <p class="eyebrow">{{ t('home.area') }}</p>
        <h2 id="group-selector-title" class="mt-2 text-3xl font-bold">{{ t('home.groups') }}</h2>
        <p class="mt-2 text-ink-700">{{ t('home.groupsCopy') }}</p>

        <section v-if="activeGroups.length" class="mt-6" aria-labelledby="active-groups">
          <h3 id="active-groups" class="text-lg font-semibold">{{ t('home.activeGroups') }}</h3>
          <ul class="ledger-list mt-3">
            <li v-for="(group, index) in activeGroups" :key="group.id">
              <NuxtLink
                :to="groupStartPath(group.id)"
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
                <NuxtLink :to="groupStartPath(group.id)" class="flex min-h-14 items-center justify-between rounded-2xl px-4 py-3 font-semibold">
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

        <NuxtLink to="/groups/new" class="primary-button mt-7 w-full"><AppIcon name="plus" />{{ isFreshStart ? t('home.firstGroup') : t('home.newGroup') }}</NuxtLink>
      </section>

      <section id="in-drei-schritten" class="landing-guide mt-8" aria-labelledby="landing-guide-title">
        <p class="eyebrow">{{ t('home.guide.eyebrow') }}</p>
        <h2 id="landing-guide-title" class="mt-2 text-2xl font-bold">{{ t('home.guide.title') }}</h2>
        <ol class="landing-guide__list">
          <li><strong>{{ t('home.guide.group') }}</strong><span>{{ t('home.guide.groupCopy') }}</span></li>
          <li><strong>{{ t('home.guide.expense') }}</strong><span>{{ t('home.guide.expenseCopy') }}</span></li>
          <li><strong>{{ t('home.guide.balance') }}</strong><span>{{ t('home.guide.balanceCopy') }}</span></li>
        </ol>
        <p class="landing-guide__note">Ohne Registrierung. Die Daten bleiben in diesem Browser verfügbar und werden bei Verbindung mit der Demo synchronisiert.</p>
      </section>
    </div>
  </main>
</template>
