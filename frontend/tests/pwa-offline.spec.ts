import { expect, test } from '@playwright/test'

test('a controlled app relaunches offline from presentation caches without caching API data', async ({
  context,
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)

  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload()
  }

  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' }).uncheck()
  await page.getByLabel('Gruppenname').fill('Offline App Shell')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Offline App Shell' })).toBeVisible()
  await page.getByRole('link', { name: '← Gruppen', exact: true }).click()
  await expect(page.getByRole('link', { name: /Offline App Shell/ })).toBeVisible()

  // Reload once under Service Worker control so the exact start document and
  // all presentation assets used by it have completed their cache writes.
  await page.reload()
  await expect(page.getByRole('link', { name: /Offline App Shell/ })).toBeVisible()
  await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([
    'joinsplit-app-documents-v1',
    'joinsplit-public-assets-v1',
  ]))

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = []
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName)
      urls.push(...(await cache.keys()).map(request => request.url))
    }
    return urls
  })
  expect(cachedUrls.some(url => new URL(url).pathname === '/')).toBe(true)
  expect(cachedUrls.every((url) => {
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/'
    return path !== '/api'
      && !path.startsWith('/api/')
      && path !== '/ready'
      && path !== '/health'
      && path !== '/up'
  })).toBe(true)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Offline App Shell/ })).toBeVisible()
})
