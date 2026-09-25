import { persistAccessIdentity, type DurableAccessIdentity } from '../persistence/database'
import type { AccessIdentitySynchronizationStatus, useAccessIdentityStore } from '../stores/access-identity'
import type { MutationSyncError } from '../stores/groups'

interface IdentityStoreLike {
  readonly accessIdentityId: string | null
  readonly credential: string | null
  readonly synchronizationStatus: AccessIdentitySynchronizationStatus
  markSynchronizationStatus(status: AccessIdentitySynchronizationStatus): void
}

interface Options {
  readonly apiBase: string
  readonly identity: ReturnType<typeof useAccessIdentityStore> | IdentityStoreLike
  readonly online: boolean
  readonly fetcher?: typeof fetch
  readonly persist?: (identity: DurableAccessIdentity) => Promise<void>
}

export type IdentityRegistrationResult =
  | { readonly outcome: 'ready' }
  | { readonly outcome: 'failed'; readonly error: Readonly<MutationSyncError> }

const registrationsInFlight = new Map<string, Promise<IdentityRegistrationResult>>()

function failure(kind: MutationSyncError['kind'], message: string, retryable: boolean): IdentityRegistrationResult {
  return { outcome: 'failed', error: Object.freeze({ kind, message, retryable }) }
}

function snapshot(identity: IdentityStoreLike, status: AccessIdentitySynchronizationStatus): DurableAccessIdentity {
  if (!identity.accessIdentityId || !identity.credential) throw new Error('Access identity is incomplete')
  return { id: identity.accessIdentityId, credential: identity.credential, synchronizationStatus: status }
}

async function registerAccessIdentity(
  options: Options,
  identityId: string,
  credential: string,
): Promise<IdentityRegistrationResult> {
  const { identity } = options

  let response: Response
  try {
    response = await (options.fetcher ?? globalThis.fetch)(
      `${options.apiBase.replace(/\/$/u, '')}/api/access-identities`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Access-Identity-ID': identityId,
          Authorization: `Bearer ${credential}`,
        },
      },
    )
  } catch {
    return failure('network', 'Der Server ist derzeit nicht erreichbar.', true)
  }

  if (response.status === 200 || response.status === 201) {
    try {
      await (options.persist ?? persistAccessIdentity)(snapshot(identity, 'registered'))
      identity.markSynchronizationStatus('registered')
      return { outcome: 'ready' }
    } catch {
      return failure('persistence', 'Die Registrierung konnte lokal nicht gespeichert werden.', true)
    }
  }
  if (response.status === 429) return failure('rate-limited', 'Zu viele Anfragen. Die Synchronisierung wird später erneut versucht.', true)
  if (response.status === 401 || response.status === 403) return failure('unauthorized', 'Die Zugriffsidentität konnte nicht registriert werden.', false)
  if (response.status >= 500) return failure('server', 'Der Server konnte die Zugriffsidentität nicht registrieren.', true)
  return failure('unexpected', 'Die Registrierung erhielt eine unerwartete Antwort.', true)
}

export async function ensureAccessIdentityRegistered(options: Options): Promise<IdentityRegistrationResult> {
  const { identity } = options
  if (!identity.accessIdentityId || !identity.credential) {
    return failure('identity', 'Die lokale Zugriffsidentität ist nicht verfügbar.', false)
  }
  if (identity.synchronizationStatus === 'expired-local-only') {
    return failure('expired', 'Die Server-Aufbewahrung ist beendet. Die Daten bleiben nur lokal verfügbar.', false)
  }
  if (identity.synchronizationStatus === 'registered') return { outcome: 'ready' }
  if (!options.online) return failure('network', 'Der Server ist derzeit nicht erreichbar.', true)

  const identityId = identity.accessIdentityId
  const credential = identity.credential
  const existingRegistration = registrationsInFlight.get(identityId)
  if (existingRegistration) return existingRegistration

  const registration = registerAccessIdentity(options, identityId, credential)
    .finally(() => registrationsInFlight.delete(identityId))
  registrationsInFlight.set(identityId, registration)

  return registration
}

export async function markAccessIdentityExpired(options: Pick<Options, 'identity' | 'persist'>): Promise<void> {
  if (!options.identity.accessIdentityId || !options.identity.credential) return
  options.identity.markSynchronizationStatus('expired-local-only')
  await (options.persist ?? persistAccessIdentity)(snapshot(options.identity, 'expired-local-only'))
}
