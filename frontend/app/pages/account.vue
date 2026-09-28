<script setup lang="ts">
import { clearAccountLocalData, loadAdoptionAttempt, persistAdoptionAttempt, type DurableAdoptionAttempt } from '~/persistence/database'
import { ensureAccessIdentityRegistered } from '~/services/access-identity-registration'
import {
  AccountRequestError,
  createAccountIdentity,
  deleteAccount,
  fetchAccountWorkspace,
  importAccountGroup,
  importAccountPeople,
  linkAnonymousIdentity,
  loginAccount,
  logoutAccount,
  persistHydratedWorkspace,
  registerAccount,
  requestPasswordReset,
  type GroupSnapshot,
} from '~/services/account'
import { serializeSettlement } from '~/domain/settlement'

const config = useRuntimeConfig()
const route = useRoute()
const { closeUtility } = useUtilityNavigation()
const accountStore = useAccountStore()
const identityStore = useAccessIdentityStore()
const groupsStore = useGroupsStore()
const peopleStore = usePeopleStore()
const mode = ref<'login' | 'register' | 'recover'>('login')
const name = ref('')
const email = ref('')
const password = ref('')
const confirmation = ref(false)
const recoverySent = ref(false)
const deletePassword = ref('')
const conflictDiscardConfirmed = ref(false)
const pendingCount = computed(() => groupsStore.pendingMutations.length + peopleStore.pendingMutations.length)
const groupCount = computed(() => groupsStore.groups.length)
const peopleCount = computed(() => peopleStore.people.length)
const conflictedGroupIds = computed(() => Object.keys(groupsStore.conflictedGroups))
const conflictedPersonIds = computed(() => peopleStore.conflictedPersonIds)
const hasConflicts = computed(() => conflictedGroupIds.value.length > 0 || conflictedPersonIds.value.length > 0)
const hasUnrelatedPendingMutations = computed(() => groupsStore.pendingMutations.some(
  mutation => !groupsStore.conflictedGroups[mutation.groupId],
) || peopleStore.pendingMutations.some(mutation => !conflictedPersonIds.value.includes(mutation.personId)))

function localSnapshots(): GroupSnapshot[] {
  return groupsStore.groups.map(group => ({
    revision: 0,
    group: {
      id: group.id, name: group.name, currency: group.currency,
      ownerAccessIdentityId: group.ownerAccessIdentityId, status: group.status,
      hasFinancialHistory: group.hasFinancialHistory,
    },
    participants: groupsStore.participantsForGroup(group.id).map(item => ({ ...item })),
    expenses: groupsStore.expensesForGroup(group.id).map(item => ({ ...item, shares: item.shares.map(share => ({ ...share })) })),
    settlements: groupsStore.settlementsForGroup(group.id).map(serializeSettlement),
  }))
}

async function adoptionAttempt(): Promise<DurableAdoptionAttempt> {
  const existing = await loadAdoptionAttempt()
  if (existing?.peopleImport) return existing
  const peopleImport = {
    importId: crypto.randomUUID(),
    people: peopleStore.people.map(({ id, name, status }) => ({ id, name, status })),
    associations: groupsStore.participants.flatMap(participant => participant.personId
      ? [{ participantId: participant.id, personId: participant.personId }] : []),
  }
  if (existing) {
    const upgraded = { ...existing, peopleImport }
    await persistAdoptionAttempt(upgraded)
    return upgraded
  }
  const attempt: DurableAdoptionAttempt = {
    adoptionId: crypto.randomUUID(),
    imports: localSnapshots().map(snapshot => ({
      groupId: snapshot.group.id,
      importId: crypto.randomUUID(),
      snapshot: { group: snapshot.group, participants: snapshot.participants, expenses: snapshot.expenses, settlements: snapshot.settlements },
    })),
    peopleImport,
  }
  await persistAdoptionAttempt(attempt)
  return attempt
}

async function adoptAndHydrate(): Promise<void> {
  const identityId = identityStore.accessIdentityId
  if (!identityId) throw new Error('Die lokale Browser-Identität fehlt.')
  const attempt = await adoptionAttempt()

  if (identityStore.synchronizationStatus === 'expired-local-only') {
    if (!attempt.imports.length) await createAccountIdentity(config.public.apiBase, identityId)
    for (const item of attempt.imports) {
      await importAccountGroup(config.public.apiBase, attempt.adoptionId, item.importId, item.snapshot as Omit<GroupSnapshot, 'revision'>)
    }
  } else {
    const registration = await ensureAccessIdentityRegistered({
      apiBase: config.public.apiBase, identity: identityStore, online: navigator.onLine,
    })
    if (registration.outcome === 'failed') throw new Error(registration.error.message)
    if (!identityStore.credential) throw new Error('Die Browser-Berechtigung fehlt.')
    await linkAnonymousIdentity(config.public.apiBase, identityId, identityStore.credential)
  }

  if (!attempt.peopleImport) throw new Error('Die Personenübernahme konnte nicht vorbereitet werden.')
  await importAccountPeople(
    config.public.apiBase,
    attempt.adoptionId,
    attempt.peopleImport.importId,
    attempt.peopleImport.people as Parameters<typeof importAccountPeople>[3],
    attempt.peopleImport.associations as Parameters<typeof importAccountPeople>[4],
  )

  const remote = await fetchAccountWorkspace(config.public.apiBase)
  await persistHydratedWorkspace(remote, identityId)
  window.location.replace('/')
}

async function submit(): Promise<void> {
  if (accountStore.busy) return
  if (pendingCount.value > 0 && identityStore.synchronizationStatus !== 'expired-local-only') {
    accountStore.fail('Vor der Übernahme müssen die ausstehenden Änderungen synchronisiert sein. Bitte online bleiben und anschließend erneut versuchen.')
    return
  }
  if (mode.value === 'register' && !confirmation.value) {
    accountStore.fail('Bitte bestätige die Übernahme aller lokalen Gruppen.')
    return
  }
  accountStore.begin()
  try {
    if (mode.value === 'register') await registerAccount(config.public.apiBase, name.value, email.value, password.value)
    else await loginAccount(config.public.apiBase, email.value, password.value)
    await adoptAndHydrate()
  } catch (error) {
    accountStore.fail(error instanceof AccountRequestError && error.status === 401
      ? 'E-Mail oder Passwort ist nicht korrekt.'
      : error instanceof Error ? error.message : 'Der Account-Vorgang ist fehlgeschlagen.')
  }
}

async function requestRecovery(): Promise<void> {
  if (accountStore.busy) return
  accountStore.begin()
  recoverySent.value = false
  try {
    await requestPasswordReset(config.public.apiBase, email.value)
    recoverySent.value = true
    accountStore.succeed()
  } catch (error) {
    accountStore.fail(error instanceof AccountRequestError && error.status === 503
      ? 'Die Passwort-Wiederherstellung ist derzeit nicht verfügbar.'
      : error instanceof Error ? error.message : 'Die Passwort-Wiederherstellung ist derzeit nicht verfügbar.')
  }
}

async function signOut(discardPending = false): Promise<void> {
  if (accountStore.busy) return
  if (pendingCount.value && !discardPending) {
    accountStore.fail(`${pendingCount.value} Änderung(en) sind noch nicht synchronisiert. Warte auf die Synchronisierung oder verwirf sie ausdrücklich.`)
    return
  }
  accountStore.begin()
  try { await logoutAccount(config.public.apiBase) } catch {
    if (!discardPending) { accountStore.fail('Abmeldung ist ohne Serverkontakt nur mit ausdrücklichem Verwerfen möglich.'); return }
  }
  await clearAccountLocalData()
  window.location.replace('/')
}

async function removeAccount(): Promise<void> {
  if (accountStore.busy || pendingCount.value) {
    accountStore.fail('Vor dem Löschen müssen alle ausstehenden Änderungen synchronisiert oder beim Abmelden verworfen werden.')
    return
  }
  accountStore.begin()
  try {
    await deleteAccount(config.public.apiBase, deletePassword.value)
    await clearAccountLocalData()
    window.location.replace('/')
  } catch (error) {
    accountStore.fail(error instanceof Error ? error.message : 'Der Account konnte nicht gelöscht werden.')
  }
}

async function discardConflictsAndRehydrate(): Promise<void> {
  if (accountStore.busy || !conflictDiscardConfirmed.value) return
  if (hasUnrelatedPendingMutations.value) {
    accountStore.fail('Neben den Konflikten gibt es weitere lokale Änderungen. Synchronisiere diese zuerst; sie werden nicht stillschweigend verworfen.')
    return
  }
  const identityId = identityStore.accessIdentityId
  if (!identityId) { accountStore.fail('Die Geräteidentität fehlt.'); return }
  accountStore.begin()
  try {
    const remote = await fetchAccountWorkspace(config.public.apiBase)
    await persistHydratedWorkspace(remote, identityId)
    window.location.reload()
  } catch (error) {
    accountStore.fail(error instanceof Error ? error.message : 'Der Serverstand konnte nicht geladen werden.')
  }
}
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <div class="utility-page-heading">
        <header>
          <p class="eyebrow">Dein Bereich</p>
          <h1 class="text-3xl font-semibold text-brand-900">Konto & Einstellungen</h1>
          <p class="mt-2 text-gray-600">Verwalte deinen Zugang und passe JoinSplit an deine Nutzung an.</p>
        </header>
        <button type="button" class="icon-button utility-page-heading__close" aria-label="Konto schließen" title="Schließen" @click="closeUtility"><AppIcon name="x" /></button>
      </div>

      <section class="account-settings-entry mt-6" aria-labelledby="app-settings-title">
        <NuxtLink :to="{ path: '/settings', query: { returnTo: route.fullPath } }" class="account-settings-entry__link">
          <span class="account-settings-entry__icon" aria-hidden="true"><AppIcon name="settings" /></span>
          <span class="account-settings-entry__copy">
            <strong id="app-settings-title">App-Einstellungen</strong>
            <small>Darstellung, Ausgleichsvorschläge und lokale Daten verwalten</small>
          </span>
          <AppIcon name="chevron-right" />
        </NuxtLink>
      </section>

      <section v-if="!accountStore.isAuthenticated" class="card mt-6 p-5" aria-labelledby="account-form-title">
        <div class="grid grid-cols-2 gap-2" role="group" aria-label="Account-Zugang">
          <button type="button" class="secondary-button" :aria-pressed="mode === 'login'" @click="mode = 'login'">Anmelden</button>
          <button type="button" class="secondary-button" :aria-pressed="mode === 'register'" @click="mode = 'register'">Registrieren</button>
        </div>
        <h2 id="account-form-title" class="mt-5 text-xl font-semibold">{{ mode === 'login' ? 'Account anmelden' : mode === 'register' ? 'Account erstellen' : 'Passwort zurücksetzen' }}</h2>
        <form v-if="mode !== 'recover'" class="mt-4 space-y-4" @submit.prevent="submit">
          <label v-if="mode === 'register'" class="block font-medium">Dein Name<input v-model="name" class="field-input mt-2" type="text" autocomplete="name" maxlength="100" required></label>
          <label class="block font-medium">E-Mail<input v-model="email" class="field-input mt-2" type="email" autocomplete="email" required></label>
          <label class="block font-medium">Passwort<input v-model="password" class="field-input mt-2" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" minlength="12" maxlength="128" required></label>
          <label v-if="mode === 'register'" class="flex items-start gap-3">
            <input v-model="confirmation" class="mt-1 size-5" type="checkbox" required>
            <span>Alle {{ groupCount }} lokalen Gruppen und {{ peopleCount }} Personen werden nach der Registrierung übernommen.</span>
          </label>
          <button v-if="mode === 'login'" type="button" class="secondary-link -ml-4" @click="mode = 'recover'; accountStore.clearError()">Passwort vergessen?</button>
          <p v-if="accountStore.error" class="error-text" role="alert">{{ accountStore.error }}</p>
          <button class="primary-button w-full" type="submit" :disabled="accountStore.busy">
            <AppIcon name="users" />{{ accountStore.busy ? 'Wird vorbereitet …' : mode === 'login' ? 'Anmelden und Daten übernehmen' : 'Registrieren und Daten übernehmen' }}
          </button>
        </form>
        <form v-else class="mt-4 space-y-4" @submit.prevent="requestRecovery">
          <label class="block font-medium">E-Mail<input v-model="email" class="field-input mt-2" type="email" autocomplete="email" required></label>
          <p class="text-sm text-gray-600">Wenn ein Account existiert, senden wir einen zeitlich begrenzten Link. Die Rückmeldung verrät nicht, ob die Adresse registriert ist.</p>
          <p v-if="recoverySent" class="rounded-lg bg-brand-50 p-3 text-brand-900" role="status">Prüfe dein Postfach. Falls ein Account existiert, wurde ein Link versendet.</p>
          <p v-if="accountStore.error" class="error-text" role="alert">{{ accountStore.error }}</p>
          <button class="primary-button w-full" type="submit" :disabled="accountStore.busy"><AppIcon name="refresh" />Link anfordern</button>
          <button type="button" class="secondary-button w-full" @click="mode = 'login'; recoverySent = false; accountStore.clearError()">Zur Anmeldung</button>
        </form>
      </section>

      <template v-else>
        <section class="card mt-6 p-5">
          <h2 class="text-xl font-semibold">Angemeldet</h2>
          <p v-if="accountStore.workspace?.name" class="mt-2 font-medium">{{ accountStore.workspace.name }}</p>
          <p class="mt-2 break-all">{{ accountStore.workspace?.email }}</p>
          <p class="mt-2 text-sm text-gray-600">{{ groupCount }} Gruppe(n) lokal verfügbar · {{ pendingCount }} Änderung(en) ausstehend</p>
          <p v-if="accountStore.error" class="error-text mt-3" role="alert">{{ accountStore.error }}</p>
          <button type="button" class="secondary-button mt-4 w-full" :disabled="accountStore.busy" @click="signOut(false)">Abmelden</button>
          <button v-if="pendingCount" type="button" class="danger-button mt-3 w-full" :disabled="accountStore.busy" @click="signOut(true)">Lokale Änderungen verwerfen und abmelden</button>
        </section>
        <section v-if="hasConflicts" class="card mt-5 border-amber-300 p-5">
          <h2 class="text-xl font-semibold">Konflikt auf einem anderen Gerät</h2>
          <p class="mt-2 text-sm text-gray-600">
            {{ conflictedGroupIds.length }} Gruppe(n) und {{ conflictedPersonIds.length }} Person(en) wurden inzwischen auf einem anderen Gerät geändert. JoinSplit führt diese Stände nicht automatisch zusammen.
          </p>
          <p v-if="hasUnrelatedPendingMutations" class="error-text mt-3" role="alert">Weitere, konfliktfreie Änderungen müssen zuerst synchronisiert werden.</p>
          <label class="mt-4 flex items-start gap-3">
            <input v-model="conflictDiscardConfirmed" class="mt-1 size-5" type="checkbox">
            <span>Konfliktänderungen dieses Geräts ausdrücklich verwerfen und den aktuellen Serverstand laden.</span>
          </label>
          <button type="button" class="danger-button mt-4 w-full" :disabled="accountStore.busy || !conflictDiscardConfirmed || hasUnrelatedPendingMutations" @click="discardConflictsAndRehydrate">
            <AppIcon name="refresh" />Serverstand laden
          </button>
        </section>
        <section class="card mt-5 border-red-200 p-5">
          <h2 class="text-xl font-semibold">Account löschen</h2>
          <p class="mt-2 text-sm text-gray-600">Löscht Account, Sitzungen und übernommene Gruppen. Free-Tier-Backups haben keine garantierte sofortige physische Löschung.</p>
          <label class="mt-4 block font-medium">Passwort bestätigen<input v-model="deletePassword" class="field-input mt-2" type="password" autocomplete="current-password"></label>
          <button type="button" class="danger-button mt-4 w-full" :disabled="accountStore.busy || !deletePassword" @click="removeAccount"><AppIcon name="trash" />Account endgültig löschen</button>
        </section>
      </template>
    </div>
  </main>
</template>
