import { expect, test } from '@playwright/test'

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

test('ships the approved manifest, icons, and root-scoped service worker', async ({ page, request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json()

  expect(manifest).toMatchObject({
    id: '/',
    name: 'JoinSplit',
    short_name: 'JoinSplit',
    lang: 'de',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbf7f0',
    theme_color: '#c44332',
  })
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }),
    expect.objectContaining({ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }),
    expect.objectContaining({ src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
  ]))

  for (const [path, size] of [
    ['/pwa-192x192.png', 192],
    ['/pwa-512x512.png', 512],
    ['/pwa-maskable-512x512.png', 512],
  ] as const) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
    expect(pngDimensions(await response.body())).toEqual({ width: size, height: size })
  }

  await page.goto('/')
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready
    return { scope: ready.scope, scriptURL: ready.active?.scriptURL ?? '' }
  })
  expect(new URL(registration.scope).pathname).toBe('/')
  expect(new URL(registration.scriptURL).pathname).toBe('/sw.js')
})
