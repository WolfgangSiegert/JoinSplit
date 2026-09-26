import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function localState(page: Page): Promise<{ groups: string[]; pendingMutations: number }> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 7)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(['groups', 'pendingMutations'])
    const groupsRequest = transaction.objectStore('groups').getAll()
    const pendingRequest = transaction.objectStore('pendingMutations').count()
    const [groups, pendingMutations] = await Promise.all([
      new Promise<Array<{ name: string }>>((resolve, reject) => {
        groupsRequest.onsuccess = () => resolve(groupsRequest.result)
        groupsRequest.onerror = () => reject(groupsRequest.error)
      }),
      new Promise<number>((resolve, reject) => {
        pendingRequest.onsuccess = () => resolve(pendingRequest.result)
        pendingRequest.onerror = () => reject(pendingRequest.error)
      }),
    ])
    db.close()
    return { groups: groups.map(group => group.name), pendingMutations }
  })
}

test('a real waiting worker never reloads silently and preserves pending IndexedDB data after explicit activation', async ({ page }) => {
  const serviceWorkerPath = resolve('.output/public/sw.js')
  const originalServiceWorker = await readFile(serviceWorkerPath, 'utf8')
  let navigationCount = 0

  try {
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    await page.route('**/api/groups', route => route.abort('connectionrefused'))
    await page.getByRole('link', { name: 'Neue Gruppe' }).click()
    await page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' }).uncheck()
    await page.getByLabel('Gruppenname').fill('Update bleibt lokal')
    await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Update bleibt lokal' })).toBeVisible()
    await expect.poll(() => localState(page)).toEqual({ groups: ['Update bleibt lokal'], pendingMutations: 1 })

    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) navigationCount += 1
    })
    await writeFile(serviceWorkerPath, `${originalServiceWorker}\n// js047-update-${Date.now()}\n`)
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update())

    await expect(page.getByRole('heading', { name: 'Neue JoinSplit-Version verfügbar' })).toBeVisible()
    await page.waitForTimeout(300)
    expect(navigationCount).toBe(0)
    expect(await localState(page)).toEqual({ groups: ['Update bleibt lokal'], pendingMutations: 1 })

    await page.getByRole('button', { name: 'Aktualisierung prüfen' }).click()
    const dialog = page.getByRole('dialog', { name: 'JoinSplit sicher aktualisieren?' })
    await expect(dialog).toContainText('eine lokale Änderung')
    const applyUpdate = dialog.getByRole('button', { name: 'Risiko akzeptieren und aktualisieren' })
    await expect(applyUpdate).toBeDisabled()
    await dialog.getByRole('checkbox').check()
    await expect(applyUpdate).toBeEnabled()

    await applyUpdate.click()
    await expect.poll(() => navigationCount).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Update bleibt lokal' })).toBeVisible()
    expect(await localState(page)).toEqual({ groups: ['Update bleibt lokal'], pendingMutations: 1 })
  } finally {
    await writeFile(serviceWorkerPath, originalServiceWorker)
  }
})
