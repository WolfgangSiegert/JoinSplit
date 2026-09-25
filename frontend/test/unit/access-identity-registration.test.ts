import { describe, expect, test, vi } from 'vitest'
import {
  ensureAccessIdentityRegistered,
  markAccessIdentityExpired,
} from '../../app/services/access-identity-registration'
import type { AccessIdentitySynchronizationStatus } from '../../app/stores/access-identity'

const ID = '11111111-1111-4111-8111-111111111111'
const CREDENTIAL = '0123456789abcdef'.repeat(4)

function identity(status: AccessIdentitySynchronizationStatus = 'never-synchronized') {
  return {
    accessIdentityId: ID,
    credential: CREDENTIAL,
    synchronizationStatus: status,
    markSynchronizationStatus(next: AccessIdentitySynchronizationStatus) {
      this.synchronizationStatus = next
    },
  }
}

describe('access identity registration protocol', () => {
  test('registers and persists a never-synchronized identity exactly once', async () => {
    const current = identity()
    const persist = vi.fn(async () => undefined)
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { id: ID } }), { status: 201 })) as typeof fetch

    await expect(ensureAccessIdentityRegistered({
      apiBase: 'https://joinsplit.tiny-bits.org/', identity: current, online: true, fetcher, persist,
    })).resolves.toEqual({ outcome: 'ready' })

    expect(fetcher).toHaveBeenCalledWith('https://joinsplit.tiny-bits.org/api/access-identities', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Access-Identity-ID': ID,
        Authorization: `Bearer ${CREDENTIAL}`,
      }),
    }))
    expect(persist).toHaveBeenCalledWith({ id: ID, credential: CREDENTIAL, synchronizationStatus: 'registered' })
    expect(current.synchronizationStatus).toBe('registered')

    await ensureAccessIdentityRegistered({
      apiBase: 'https://joinsplit.tiny-bits.org', identity: current, online: true, fetcher, persist,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('shares an in-flight registration between concurrent synchronization paths', async () => {
    const current = identity()
    const persist = vi.fn(async () => undefined)
    let resolveRegistration!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRegistration = resolve
    })) as typeof fetch
    const options = {
      apiBase: 'https://joinsplit.tiny-bits.org', identity: current, online: true, fetcher, persist,
    }

    const first = ensureAccessIdentityRegistered(options)
    const second = ensureAccessIdentityRegistered(options)
    expect(fetcher).toHaveBeenCalledTimes(1)

    resolveRegistration(new Response(JSON.stringify({ data: { id: ID } }), { status: 201 }))
    await expect(Promise.all([first, second])).resolves.toEqual([{ outcome: 'ready' }, { outcome: 'ready' }])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  test('never registers an expired local-only identity', async () => {
    const fetcher = vi.fn()
    const result = await ensureAccessIdentityRegistered({
      apiBase: 'https://joinsplit.tiny-bits.org', identity: identity('expired-local-only'), online: true,
      fetcher: fetcher as typeof fetch,
    })

    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'expired', retryable: false } })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('persists terminal expiry and treats registration throttling as retryable', async () => {
    const current = identity('registered')
    const persist = vi.fn(async () => undefined)
    await markAccessIdentityExpired({ identity: current, persist })
    expect(current.synchronizationStatus).toBe('expired-local-only')
    expect(persist).toHaveBeenCalledWith({ id: ID, credential: CREDENTIAL, synchronizationStatus: 'expired-local-only' })

    const fresh = identity()
    const result = await ensureAccessIdentityRegistered({
      apiBase: 'https://joinsplit.tiny-bits.org', identity: fresh, online: true,
      fetcher: vi.fn(async () => new Response(null, { status: 429 })) as typeof fetch,
      persist,
    })
    expect(result).toMatchObject({ outcome: 'failed', error: { kind: 'rate-limited', retryable: true } })
    expect(fresh.synchronizationStatus).toBe('never-synchronized')
  })
})
