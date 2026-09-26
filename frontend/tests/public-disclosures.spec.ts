import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
}

async function currentIdentityId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const result = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string } | undefined>((resolve, reject) => {
      result.onsuccess = () => resolve(result.result)
      result.onerror = () => reject(result.error)
    })
    db.close()
    return identity?.id ?? null
  })
}

async function seedPendingLocalGroup(page: Page, ownerAccessIdentityId: string): Promise<void> {
  await page.evaluate(async ({ ownerAccessIdentityId }) => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const groupId = '11111111-1111-4111-8111-111111111111'
    const tx = db.transaction(['groups', 'pendingMutations'], 'readwrite')
    tx.objectStore('groups').add({
      id: groupId,
      name: 'Nur lokal',
      currency: 'EUR',
      ownerAccessIdentityId,
      status: 'active',
      hasFinancialHistory: false,
      participantIds: [],
    })
    tx.objectStore('pendingMutations').add({
      id: '22222222-2222-4222-8222-222222222222',
      type: 'CreateGroup',
      groupId,
      createdOrder: 0,
      payload: { groupId, name: 'Nur lokal', currency: 'EUR', actorId: ownerAccessIdentityId, initialParticipant: null },
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, { ownerAccessIdentityId })
}

async function localRecordCounts(page: Page): Promise<{ groups: number; pendingMutations: number }> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['groups', 'pendingMutations'])
    const count = (store: IDBObjectStore) => new Promise<number>((resolve, reject) => {
      const result = store.count()
      result.onsuccess = () => resolve(result.result)
      result.onerror = () => reject(result.error)
    })
    const [groups, pendingMutations] = await Promise.all([
      count(tx.objectStore('groups')),
      count(tx.objectStore('pendingMutations')),
    ])
    db.close()
    return { groups, pendingMutations }
  })
}

test('shows the public-demo boundary before data entry and keeps full disclosures reachable', async ({ page }) => {
  await page.goto('/groups/new')

  const notice = page.getByRole('complementary', { name: 'Öffentliche Portfolio-Demo' })
  await expect(notice).toContainText('nur erfundene Namen und Testbeträge')
  await expect(notice).toContainText('nicht für echte Zahlungen')
  await expect(notice).toBeInViewport()
  await notice.getByRole('link', { name: 'Demo- und Datenhinweise' }).click()

  await expect(page).toHaveURL('/demo')
  await expect(page.getByRole('heading', { level: 1, name: 'Demo- und Datenhinweise' })).toBeVisible()
  await expect(page.getByText('Da Render einen inaktiven kostenlosen Dienst pausiert, gibt es für die physische Löschung keine feste Frist.')).toBeVisible()
  await expect(page.getByText('Sie ist kein Nutzer-Backup und begründet keine zugesagte technische Löschfrist.')).toBeVisible()
  await expect(page.getByText('Ein erster Aufruf, Neustart oder Reload ohne Netzwerk ist nicht garantiert.')).toBeVisible()
  await expect(page.getByText('Verantwortlich: Wolfgang Siegert')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Kontakt aufnehmen' })).toHaveAttribute('href', 'mailto:WoSiegert@hotmail.com')
  await expectNoAxeViolations(page)
})

test('local reset requires explicit confirmation and replaces the browser identity without contacting deletion APIs', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await expect.poll(() => currentIdentityId(page)).not.toBeNull()
  const previousIdentityId = await currentIdentityId(page)
  expect(previousIdentityId).not.toBeNull()
  await seedPendingLocalGroup(page, previousIdentityId!)
  expect(await localRecordCounts(page)).toEqual({ groups: 1, pendingMutations: 1 })

  await page.getByRole('link', { name: 'Einstellungen' }).click()
  const trigger = page.getByRole('button', { name: 'Lokale Daten zurücksetzen' })
  await trigger.click()
  const dialog = page.getByRole('alertdialog', { name: 'Lokale Daten endgültig zurücksetzen?' })
  await expect(dialog).toContainText('noch nicht synchronisierten Änderungen')
  await expect(dialog).toContainText('Bereits synchronisierte Serverkopien werden nicht gelöscht')
  await dialog.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(trigger).toBeFocused()

  await trigger.click()
  const deletionRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'DELETE') deletionRequests.push(request.url())
  })
  await dialog.getByRole('button', { name: 'Lokale Daten endgültig löschen' }).click()
  await expect(page).toHaveURL('/?reset=1')
  await expect(page.getByRole('status')).toContainText('Lokale Daten wurden zurückgesetzt')

  await expect.poll(() => currentIdentityId(page)).not.toBeNull()
  const replacementIdentityId = await currentIdentityId(page)
  expect(replacementIdentityId).not.toBeNull()
  expect(replacementIdentityId).not.toBe(previousIdentityId)
  expect(await localRecordCounts(page)).toEqual({ groups: 0, pendingMutations: 0 })
  expect(deletionRequests).toEqual([])
  await expect(page.getByText('Mehr zusammen erleben. Weniger rechnen.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Neue Gruppe starten' })).toContainText('Erste Gruppe starten')
  await expectNoAxeViolations(page)
})
