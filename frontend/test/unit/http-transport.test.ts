import { beforeEach, describe, expect, it, vi } from 'vitest'

const { clearCookies, isNativePlatform } = vi.hoisted(() => ({
  clearCookies: vi.fn(),
  isNativePlatform: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
  CapacitorCookies: { clearCookies },
}))

import { applicationFetch, clearNativeApiCookies, usesNativeHttpTransport } from '../../app/services/http-transport'

describe('native HTTP transport boundary', () => {
  beforeEach(() => {
    clearCookies.mockReset()
    isNativePlatform.mockReset().mockReturnValue(false)
  })

  it('delegates requests to the globally patched fetch boundary', async () => {
    const response = new Response(null, { status: 204 })
    const fetcher = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetcher)

    await expect(applicationFetch('https://joinsplit.tiny-bits.org/up')).resolves.toBe(response)
    expect(fetcher).toHaveBeenCalledWith('https://joinsplit.tiny-bits.org/up', undefined)

    vi.unstubAllGlobals()
  })

  it('does not touch browser cookies outside a native container', async () => {
    expect(usesNativeHttpTransport()).toBe(false)
    await expect(clearNativeApiCookies('https://joinsplit.tiny-bits.org')).resolves.toBe(true)
    expect(clearCookies).not.toHaveBeenCalled()
  })

  it('clears only the canonical API cookie scope after a native session ends', async () => {
    isNativePlatform.mockReturnValue(true)

    await expect(clearNativeApiCookies('https://joinsplit.tiny-bits.org/')).resolves.toBe(true)

    expect(clearCookies).toHaveBeenCalledOnce()
    expect(clearCookies).toHaveBeenCalledWith({ url: 'https://joinsplit.tiny-bits.org' })
  })

  it('reports native cookie cleanup failure without masking an invalidated server session', async () => {
    isNativePlatform.mockReturnValue(true)
    clearCookies.mockRejectedValueOnce(new Error('native cookie store unavailable'))

    await expect(clearNativeApiCookies('https://joinsplit.tiny-bits.org')).resolves.toBe(false)
  })
})
