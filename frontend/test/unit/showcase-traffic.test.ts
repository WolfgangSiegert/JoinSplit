import { describe, expect, it, vi } from 'vitest'
import {
  createShowcaseTrafficRecorder,
  planShowcaseTraffic,
  SHOWCASE_APP_ORIGIN,
  SHOWCASE_TRAFFIC_ENDPOINT,
} from '../../app/services/showcase-traffic'

describe('central showcase traffic client', () => {
  it('sends one fixed, credential-free JoinSplit app event per document', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(null, { status: 204 }))
    const record = createShowcaseTrafficRecorder(fetcher as typeof fetch)

    await expect(record(SHOWCASE_TRAFFIC_ENDPOINT)).resolves.toBe('recorded')
    await expect(record(SHOWCASE_TRAFFIC_ENDPOINT)).resolves.toBe('already-recorded')

    expect(fetcher).toHaveBeenCalledOnce()
    const [endpoint, options] = fetcher.mock.calls[0]!
    expect(endpoint).toBe(SHOWCASE_TRAFFIC_ENDPOINT)
    expect(options).toMatchObject({
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      referrerPolicy: 'no-referrer',
    })
    expect(options?.body).toBeInstanceOf(URLSearchParams)
    const body = options?.body as URLSearchParams
    expect([...body.keys()]).toEqual(['version', 'site', 'path'])
    expect(body.toString()).toBe('version=1&site=joinsplit&path=%2Fapp')
    expect(new Request(endpoint, options).headers.get('content-type'))
      .toBe('application/x-www-form-urlencoded;charset=UTF-8')
  })

  it('does not retry a possibly accepted event after a network failure', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => { throw new Error('offline') })
    const record = createShowcaseTrafficRecorder(fetcher as typeof fetch)

    await expect(record(SHOWCASE_TRAFFIC_ENDPOINT)).resolves.toBe('failed')
    await expect(record(SHOWCASE_TRAFFIC_ENDPOINT)).resolves.toBe('already-recorded')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([
    ['unconfigured endpoint', { endpoint: '' }],
    ['unapproved endpoint', { endpoint: 'https://untrusted.example/api/showcase-traffic' }],
    ['local development', { appOrigin: 'http://127.0.0.1:3004' }],
    ['native build', { nativeApp: true }],
    ['Global Privacy Control', { globalPrivacyControl: true }],
    ['automated browser', { webdriver: true }],
  ])('skips %s', (_case, overrides) => {
    expect(planShowcaseTraffic({
      endpoint: SHOWCASE_TRAFFIC_ENDPOINT,
      appOrigin: SHOWCASE_APP_ORIGIN,
      nativeApp: false,
      prerendering: false,
      ...overrides,
    })).toBe('skip')
  })

  it('waits for prerender activation and otherwise records only in production', () => {
    const productionContext = {
      endpoint: SHOWCASE_TRAFFIC_ENDPOINT,
      appOrigin: SHOWCASE_APP_ORIGIN,
      nativeApp: false,
      prerendering: false,
    }

    expect(planShowcaseTraffic(productionContext)).toBe('record')
    expect(planShowcaseTraffic({ ...productionContext, prerendering: true }))
      .toBe('wait-for-activation')
  })

  it('does not send to an unapproved endpoint even when called directly', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const record = createShowcaseTrafficRecorder(fetcher as typeof fetch)

    await expect(record('https://untrusted.example/api/showcase-traffic')).resolves.toBe('skipped')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
