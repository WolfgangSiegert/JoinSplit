import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  isCacheableAppNavigation,
  isCacheablePublicAsset,
  isNetworkOnlyRequest,
} from '../../pwa/runtime-caching'

const ORIGIN = 'https://joinsplit.tiny-bits.org'

function context(
  path: string,
  request: Partial<Pick<Request, 'destination' | 'method' | 'mode'>> = {},
) {
  return {
    request: {
      destination: '',
      method: 'GET',
      mode: 'cors',
      ...request,
    } as Pick<Request, 'destination' | 'method' | 'mode'>,
    url: new URL(path, ORIGIN),
  }
}

beforeEach(() => vi.stubGlobal('location', { origin: ORIGIN }))
afterEach(() => vi.unstubAllGlobals())

describe('PWA runtime cache boundary', () => {
  test.each(['/api', '/api/', '/api/account', '/ready', '/health', '/up'])(
    'keeps %s on the network',
    path => expect(isNetworkOnlyRequest(context(path))).toBe(true),
  )

  test('does not claim unrelated or cross-origin requests as network-only routes', () => {
    expect(isNetworkOnlyRequest(context('/groups/example'))).toBe(false)
    expect(isNetworkOnlyRequest({
      ...context('/api/groups'),
      url: new URL('https://api.example.test/api/groups'),
    })).toBe(false)
  })

  test('caches only same-origin GET navigations outside protected endpoints', () => {
    expect(isCacheableAppNavigation(context('/groups/example', { mode: 'navigate' }))).toBe(true)
    expect(isCacheableAppNavigation(context('/api/groups', { mode: 'navigate' }))).toBe(false)
    expect(isCacheableAppNavigation(context('/ready', { mode: 'navigate' }))).toBe(false)
    expect(isCacheableAppNavigation(context('/', { method: 'POST', mode: 'navigate' }))).toBe(false)
    expect(isCacheableAppNavigation({
      ...context('/', { mode: 'navigate' }),
      url: new URL('https://example.test/'),
    })).toBe(false)
  })

  test.each(['font', 'image', 'manifest', 'script', 'style'] as const)(
    'caches same-origin %s assets',
    destination => expect(isCacheablePublicAsset(context('/asset', { destination }))).toBe(true),
  )

  test('does not cache data requests, mutations, or cross-origin assets', () => {
    expect(isCacheablePublicAsset(context('/api/groups'))).toBe(false)
    expect(isCacheablePublicAsset(context('/app.js', { destination: 'script', method: 'POST' }))).toBe(false)
    expect(isCacheablePublicAsset({
      ...context('/app.js', { destination: 'script' }),
      url: new URL('https://cdn.example.test/app.js'),
    })).toBe(false)
  })
})
