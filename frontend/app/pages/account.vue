<script setup lang="ts">
import { acceptServerGroupVersion, clearAccountLocalData, loadAdoptionAttempt, loadDurableState, persistAdoptionAttempt, rebaseLocalGroupVersion, type DurableAdoptionAttempt } from '~/persistence/database'
import { ensureAccessIdentityRegistered } from '~/services/access-identity-registration'
import {
  AccountRequestError,
  changeAccountPassword,
  createAccountIdentity,
  deleteAccount,
  fetchCurrentAccount,
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
import { restoreSettlement, serializeSettlement } from '~/domain/settlement'

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
const reauthenticationPassword = ref('')
const localDeleteConfirmed = ref(false)
const recoveryExported = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirmation = ref('')
const passwordChanged = ref(false)
const resumableAccountEmail = ref('')
const adoptionSummary = ref<{ localGroups: number; localPeople: number; serverGroups: number; serverPeople: number } | null>(null)
const remoteConflictGroups = ref<GroupSnapshot[]>([])
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
const pendingByGroup = computed(() => groupsStore.groups.map(group => {
  const mutations = groupsStore.pendingMutations.filter(mutation => mutation.groupId === group.id)
  const failed = mutations.map(mutation => groupsStore.mutationSync[mutation.id])
    .find(state => state?.state === 'failed')
  return { id: group.id, name: group.name, count: mutations.length, error: failed?.state === 'failed' ? failed.error.message : '' }
}).filter(group => group.count > 0))
const lastSuccessfulSync = computed(() => {
  const value = accountStore.workspace?.lastSuccessfulSyncAt
  return value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Noch keine erfolgreiche Synchronisierung'
})

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
  adoptionSummary.value = {
    localGroups: groupCount.value,
    localPeople: peopleCount.value,
    serverGroups: remote.groups.length,
    serverPeople: remote.people.length,
  }
  const hydration = await persistHydratedWorkspace(remote, identityId)
  identityStore.hydrate(hydration.identity)
  accountStore.finish(hydration.workspace)
  peopleStore.hydrate(hydration.people, [])
  groupsStore.hydrate({
    groups: [...hydration.groups],
    participants: [...hydration.participants],
    expenses: [...hydration.expenses],
    settlements: hydration.settlements.map(restoreSettlement),
    pendingMutations: [],
    groupRevisions: hydration.workspace.groupRevisions,
    conflictedGroupIds: hydration.workspace.conflictedGroupIds,
  })
}

async function submit(): Promise<void> {
  if (accountStore.busy) return
  if (pendingCount.value > 0 && identityStore.synchronizationStatus !== 'expired-local-only') {
    accountStore.fail('Vor der Übernahme müssen die ausstehenden Änderungen synchronisiert sein. Bitte online bleiben und anschließend erneut versuchen.')
    return
  }
  if ((groupCount.value > 0 || peopleCount.value > 0) && !confirmation.value) {
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

async function resumeAdoption(): Promise<void> {
  if (accountStore.busy) return
  accountStore.begin()
  try {
    await fetchCurrentAccount(config.public.apiBase)
    await adoptAndHydrate()
  } catch (error) {
    accountStore.fail(error instanceof AccountRequestError && error.status === 401
      ? 'Die Serversitzung ist abgelaufen. Melde dich erneut an; der vorbereitete Import bleibt erhalten.'
      : error instanceof Error ? error.message : 'Die Übernahme konnte nicht fortgesetzt werden.')
  }
}

onMounted(async () => {
  if (accountStore.isAuthenticated) return
  const attempt = await loadAdoptionAttempt()
  if (!attempt) return
  try {
    const current = await fetchCurrentAccount(config.public.apiBase)
    resumableAccountEmail.value = current.email
  } catch { /* no resumable server session */ }
})

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

async function signOut(): Promise<void> {
  if (accountStore.busy) return
  accountStore.begin()
  try {
    await logoutAccount(config.public.apiBase)
  } catch (error) {
    if (!(error instanceof AccountRequestError && error.status === 401)) {
      accountStore.fail('Die Serversitzung konnte nicht beendet werden. Deine lokalen Daten wurden nicht verändert.')
      return
    }
  }
  accountStore.markSignedOut()
}

async function reauthenticate(): Promise<void> {
  if (accountStore.busy || !accountStore.workspace) return
  accountStore.begin()
  try {
    const account = await loginAccount(config.public.apiBase, accountStore.workspace.email, reauthenticationPassword.value)
    if (account.id !== accountStore.workspace.accountId) throw new Error('Die Anmeldung gehört nicht zum lokal gespeicherten Account.')
    reauthenticationPassword.value = ''
    groupsStore.resetSessionFailures()
    accountStore.activateSession()
  } catch (error) {
    accountStore.fail(error instanceof AccountRequestError && error.status === 401
      ? 'E-Mail oder Passwort ist nicht korrekt.'
      : error instanceof Error ? error.message : 'Die erneute Anmeldung ist fehlgeschlagen.')
    accountStore.expireSession(accountStore.error)
  }
}

async function exportLocalRecovery(): Promise<void> {
  const state = await loadDurableState()
  const exportedAt = new Date().toISOString()
  const safeState = {
    format: 'joinsplit-local-recovery', version: 1, exportedAt,
    data: {
      ...state,
      accessIdentity: state.accessIdentity ? {
        id: state.accessIdentity.id,
        synchronizationStatus: state.accessIdentity.synchronizationStatus,
      } : null,
    },
  }
  const blob = new Blob([JSON.stringify(safeState, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `joinsplit-sicherung-${exportedAt.slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
  recoveryExported.value = true
}

async function deleteLocalCopy(): Promise<void> {
  if (!localDeleteConfirmed.value || !recoveryExported.value) return
  try {
    await logoutAccount(config.public.apiBase)
  } catch (error) {
    if (!(error instanceof AccountRequestError && error.status === 401)) {
      accountStore.fail('Die Serversitzung konnte nicht beendet werden. Die lokale Kopie wurde nicht gelöscht.')
      return
    }
  }
  await clearAccountLocalData()
  window.location.replace('/')
}

async function updatePassword(): Promise<void> {
  if (accountStore.busy || accountStore.sessionState !== 'active') return
  passwordChanged.value = false
  if (newPassword.value !== newPasswordConfirmation.value) {
    accountStore.fail('Die Wiederholung des neuen Passworts stimmt nicht überein.')
    return
  }
  accountStore.begin()
  try {
    await changeAccountPassword(config.public.apiBase, currentPassword.value, newPassword.value, newPasswordConfirmation.value)
    currentPassword.value = ''
    newPassword.value = ''
    newPasswordConfirmation.value = ''
    passwordChanged.value = true
    accountStore.succeed()
  } catch (error) {
    if (error instanceof AccountRequestError && error.status === 401) accountStore.expireSession()
    else accountStore.fail(error instanceof AccountRequestError && error.status === 422
      ? 'Das aktuelle Passwort ist nicht korrekt oder das neue Passwort erfüllt die Anforderungen nicht.'
      : error instanceof Error ? error.message : 'Das Passwort konnte nicht geändert werden.')
  }
}

async function removeAccount(): Promise<void> {
  if (accountStore.busy || pendingCount.value) {
    accountStore.fail('Vor dem Löschen müssen alle ausstehenden Änderungen synchronisiert oder über den lokalen Wiederherstellungsstand gesichert und ausdrücklich gelöscht werden.')
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

async function loadConflictVersions(): Promise<void> {
  if (!conflictedGroupIds.value.length || accountStore.sessionState !== 'active') return
  try {
    const remote = await fetchAccountWorkspace(config.public.apiBase)
    remoteConflictGroups.value = remote.groups.filter(group => conflictedGroupIds.value.includes(group.group.id))
  } catch { /* the session status UI remains the source of truth */ }
}

function remoteConflict(groupId: string): GroupSnapshot | undefined {
  return remoteConflictGroups.value.find(item => item.group.id === groupId)
}

function formatMinor(amountMinor: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountMinor / 100)
}

async function chooseServerVersion(groupId: string): Promise<void> {
  const remote = remoteConflict(groupId)
  if (!remote) {
    accountStore.fail('Diese Gruppe ist im Serverstand nicht mehr vorhanden. Nutze „Serverstand laden“, um die Löschung kontrolliert zu übernehmen.')
    return
  }
  await acceptServerGroupVersion(remote)
  window.location.reload()
}

async function chooseLocalVersion(groupId: string): Promise<void> {
  const remote = remoteConflict(groupId)
  if (!remote) {
    accountStore.fail('Die lokale Version kann nicht automatisch auf eine serverseitig gelöschte Gruppe angewendet werden.')
    return
  }
  await rebaseLocalGroupVersion(groupId, remote.revision)
  window.location.reload()
}

watch(() => accountStore.sessionState, state => {
  if (state === 'active') void loadConflictVersions()
}, { immediate: true })
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
        <div v-if="resumableAccountEmail" class="mb-5 rounded-xl border border-amber-300 p-4" role="status">
          <strong>Unterbrochene Übernahme gefunden</strong>
          <p class="mt-1 text-sm text-gray-600">Die Anmeldung für {{ resumableAccountEmail }} ist noch aktiv. Der Import kann mit denselben Importkennungen sicher fortgesetzt werden.</p>
          <button type="button" class="secondary-button mt-3 w-full" :disabled="accountStore.busy" @click="resumeAdoption"><AppIcon name="refresh" />Übernahme fortsetzen</button>
        </div>
        <div class="grid grid-cols-2 gap-2" role="group" aria-label="Account-Zugang">
          <button type="button" class="secondary-button" :aria-pressed="mode === 'login'" @click="mode = 'login'">Anmelden</button>
          <button type="button" class="secondary-button" :aria-pressed="mode === 'register'" @click="mode = 'register'">Registrieren</button>
        </div>
        <h2 id="account-form-title" class="mt-5 text-xl font-semibold">{{ mode === 'login' ? 'Account anmelden' : mode === 'register' ? 'Account erstellen' : 'Passwort zurücksetzen' }}</h2>
        <form v-if="mode !== 'recover'" class="mt-4 space-y-4" @submit.prevent="submit">
          <div v-if="groupCount > 0 || peopleCount > 0" class="rounded-xl border border-gray-200 p-4">
            <strong>Lokale Daten auf diesem Gerät</strong>
            <p class="mt-1 text-sm text-gray-600">{{ groupCount }} Gruppe(n) und {{ peopleCount }} Person(en) werden dem angemeldeten Account hinzugefügt. Serverdaten werden nicht stillschweigend ersetzt.</p>
          </div>
          <label v-if="mode === 'register'" class="block font-medium">Dein Name<input v-model="name" class="field-input mt-2" type="text" autocomplete="name" maxlength="100" required></label>
          <label class="block font-medium">E-Mail<input v-model="email" class="field-input mt-2" type="email" autocomplete="email" required></label>
          <label class="block font-medium">Passwort<input v-model="password" class="field-input mt-2" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" minlength="12" maxlength="128" required></label>
          <label v-if="groupCount > 0 || peopleCount > 0" class="flex items-start gap-3">
            <input v-model="confirmation" class="mt-1 size-5" type="checkbox" required>
            <span>Ich möchte diese {{ groupCount }} lokalen Gruppen und {{ peopleCount }} Personen dem Account hinzufügen.</span>
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
        <section v-if="adoptionSummary" class="card mt-6 border-emerald-300 p-5" role="status">
          <h2 class="text-xl font-semibold">Datenübernahme abgeschlossen</h2>
          <p class="mt-2 text-sm text-gray-600">Vorher lokal: {{ adoptionSummary.localGroups }} Gruppe(n), {{ adoptionSummary.localPeople }} Person(en). Jetzt im Account: {{ adoptionSummary.serverGroups }} Gruppe(n), {{ adoptionSummary.serverPeople }} Person(en).</p>
        </section>
        <section class="card mt-6 p-5">
          <h2 class="text-xl font-semibold">Account auf diesem Gerät</h2>
          <p v-if="accountStore.workspace?.name" class="mt-2 font-medium">{{ accountStore.workspace.name }}</p>
          <p class="mt-2 break-all">{{ accountStore.workspace?.email }}</p>
          <p class="mt-2 text-sm text-gray-600">{{ groupCount }} Gruppe(n) lokal verfügbar · {{ pendingCount }} Änderung(en) noch nicht auf dem Server</p>
          <p class="mt-1 text-sm text-gray-600">Letzte erfolgreiche Synchronisierung: {{ lastSuccessfulSync }}</p>
          <p v-if="accountStore.sessionState === 'checking'" class="mt-3 text-sm text-gray-600" role="status">Serversitzung wird geprüft …</p>
          <p v-else-if="accountStore.sessionState === 'active'" class="mt-3 text-sm text-emerald-700" role="status">Serversitzung aktiv</p>
          <p v-else-if="accountStore.sessionState === 'offline'" class="mt-3 text-sm text-amber-700" role="status">Server derzeit nicht erreichbar. Lokale Daten bleiben erhalten.</p>
          <p v-else-if="accountStore.needsReauthentication" class="mt-3 text-sm text-amber-700" role="status">Erneute Anmeldung erforderlich. Lokale Daten und Warteschlange bleiben erhalten.</p>
          <p v-if="accountStore.error" class="error-text mt-3" role="alert">{{ accountStore.error }}</p>
          <form v-if="accountStore.needsReauthentication" class="mt-4 space-y-3" @submit.prevent="reauthenticate">
            <label class="block font-medium">Passwort erneut eingeben<input v-model="reauthenticationPassword" class="field-input mt-2" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label>
            <button class="primary-button w-full" type="submit" :disabled="accountStore.busy"><AppIcon name="refresh" />Erneut anmelden und synchronisieren</button>
          </form>
          <button v-if="accountStore.sessionState === 'active'" type="button" class="secondary-button mt-4 w-full" :disabled="accountStore.busy" @click="signOut">Abmelden · lokale Daten behalten</button>
        </section>
        <section class="card mt-5 p-5" aria-labelledby="sync-overview-title">
          <h2 id="sync-overview-title" class="text-xl font-semibold">Synchronisierungsübersicht</h2>
          <p class="mt-2 text-sm text-gray-600">{{ pendingCount === 0 ? 'Alle lokalen Änderungen sind auf dem Server.' : `${pendingCount} lokale Änderung(en) warten auf den Server.` }}</p>
          <ul v-if="pendingByGroup.length" class="mt-4 divide-y divide-gray-200">
            <li v-for="group in pendingByGroup" :key="group.id" class="py-3">
              <NuxtLink :to="`/groups/${group.id}`" class="flex items-center justify-between gap-4 font-medium">
                <span>{{ group.name }}</span><span>{{ group.count }}</span>
              </NuxtLink>
              <p v-if="group.error" class="mt-1 text-sm text-amber-700">{{ group.error }}</p>
            </li>
          </ul>
          <p v-if="peopleStore.pendingMutations.length" class="mt-3 text-sm">Personenverzeichnis: {{ peopleStore.pendingMutations.length }} Änderung(en)</p>
        </section>
        <section class="card mt-5 p-5" aria-labelledby="local-recovery-title">
          <h2 id="local-recovery-title" class="text-xl font-semibold">Lokaler Wiederherstellungsstand</h2>
          <p class="mt-2 text-sm text-gray-600">Die Sicherung enthält Gruppen, Ausgaben und ausstehende Änderungen, aber kein Passwort und keine Geräteberechtigung.</p>
          <button type="button" class="secondary-button mt-4 w-full" @click="exportLocalRecovery"><AppIcon name="download" />JSON-Sicherung herunterladen</button>
          <details class="mt-4">
            <summary class="secondary-link">Lokale Daten von diesem Gerät entfernen</summary>
            <p class="mt-3 text-sm text-gray-600">Das entfernt auch {{ pendingCount }} noch nicht synchronisierte Änderung(en). Der Account und bereits synchronisierte Serverdaten bleiben bestehen.</p>
            <label class="mt-3 flex items-start gap-3">
              <input v-model="localDeleteConfirmed" class="mt-1 size-5" type="checkbox">
              <span>Ich habe die JSON-Sicherung heruntergeladen und möchte die lokale Kopie löschen.</span>
            </label>
            <button type="button" class="danger-button mt-3 w-full" :disabled="!localDeleteConfirmed || !recoveryExported" @click="deleteLocalCopy"><AppIcon name="trash" />Lokale Daten löschen</button>
          </details>
        </section>
        <section class="card mt-5 p-5" aria-labelledby="change-password-title">
          <h2 id="change-password-title" class="text-xl font-semibold">Passwort ändern</h2>
          <p class="mt-2 text-sm text-gray-600">Das neue Passwort muss mindestens 12 Zeichen haben. Andere angemeldete Geräte werden abgemeldet; diese Sitzung bleibt aktiv.</p>
          <form class="mt-4 space-y-4" @submit.prevent="updatePassword">
            <label class="block font-medium">Aktuelles Passwort<input v-model="currentPassword" class="field-input mt-2" type="password" autocomplete="current-password" maxlength="128" required></label>
            <label class="block font-medium">Neues Passwort<input v-model="newPassword" class="field-input mt-2" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
            <label class="block font-medium">Neues Passwort wiederholen<input v-model="newPasswordConfirmation" class="field-input mt-2" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
            <p v-if="passwordChanged" class="text-sm text-emerald-700" role="status">Das Passwort wurde geändert.</p>
            <button class="secondary-button w-full" type="submit" :disabled="accountStore.busy || accountStore.sessionState !== 'active'"><AppIcon name="lock" />Passwort ändern</button>
          </form>
        </section>
        <section v-if="hasConflicts" class="card mt-5 border-amber-300 p-5">
          <h2 class="text-xl font-semibold">Konflikt auf einem anderen Gerät</h2>
          <p class="mt-2 text-sm text-gray-600">
            {{ conflictedGroupIds.length }} Gruppe(n) und {{ conflictedPersonIds.length }} Person(en) wurden inzwischen auf einem anderen Gerät geändert. JoinSplit führt diese Stände nicht automatisch zusammen.
          </p>
          <p v-if="hasUnrelatedPendingMutations" class="error-text mt-3" role="alert">Weitere, konfliktfreie Änderungen müssen zuerst synchronisiert werden.</p>
          <div v-for="groupId in conflictedGroupIds" :key="groupId" class="mt-4 rounded-xl border border-amber-300 p-4">
            <h3 class="font-semibold">{{ groupsStore.findStoredGroup(groupId)?.name ?? 'Lokale Gruppe' }}</h3>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg border border-gray-200 p-3">
                <strong>Auf diesem Gerät</strong>
                <p class="mt-1 text-sm text-gray-600">Name: {{ groupsStore.findStoredGroup(groupId)?.name }}</p>
                <p class="mt-1 text-sm text-gray-600">Personen: {{ groupsStore.participantsForGroup(groupId).map(item => item.name).join(', ') || 'keine' }}</p>
                <details v-if="groupsStore.expensesForGroup(groupId).length" class="mt-2 text-sm">
                  <summary>{{ groupsStore.expensesForGroup(groupId).length }} Ausgaben anzeigen</summary>
                  <ul class="mt-2 space-y-1"><li v-for="expense in groupsStore.expensesForGroup(groupId)" :key="expense.id">{{ expense.description }} · {{ formatMinor(expense.amountMinor) }}</li></ul>
                </details>
                <p class="mt-2 text-sm font-medium">{{ groupsStore.pendingMutations.filter(item => item.groupId === groupId).length }} offene Änderungen</p>
              </div>
              <div class="rounded-lg border border-gray-200 p-3">
                <strong>Auf dem Server</strong>
                <template v-if="remoteConflict(groupId)">
                  <p class="mt-1 text-sm text-gray-600">Name: {{ remoteConflict(groupId)!.group.name }} · Revision {{ remoteConflict(groupId)!.revision }}</p>
                  <p class="mt-1 text-sm text-gray-600">Personen: {{ remoteConflict(groupId)!.participants.map(item => item.name).join(', ') || 'keine' }}</p>
                  <details v-if="remoteConflict(groupId)!.expenses.length" class="mt-2 text-sm">
                    <summary>{{ remoteConflict(groupId)!.expenses.length }} Ausgaben anzeigen</summary>
                    <ul class="mt-2 space-y-1"><li v-for="expense in remoteConflict(groupId)!.expenses" :key="expense.id">{{ expense.description }} · {{ formatMinor(expense.amountMinor) }}</li></ul>
                  </details>
                </template>
                <p v-else class="mt-1 text-sm text-gray-600">Nicht vorhanden oder noch nicht geladen</p>
              </div>
            </div>
            <p class="mt-3 text-sm text-gray-600">„Lokale Version anwenden“ setzt die offenen Änderungen auf den aktuellen Serverstand auf. Das ist keine automatische inhaltliche Zusammenführung.</p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" class="secondary-button" :disabled="!remoteConflict(groupId)" @click="chooseLocalVersion(groupId)">Lokale Version anwenden</button>
              <button type="button" class="secondary-button" :disabled="!remoteConflict(groupId)" @click="chooseServerVersion(groupId)">Serverversion übernehmen</button>
            </div>
          </div>
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
