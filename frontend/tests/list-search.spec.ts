import { expect, test } from '@playwright/test'

const SUMMER_GROUP_ID = '71000000-0000-4000-8000-000000000001'
const WINTER_GROUP_ID = '71000000-0000-4000-8000-000000000002'
const PARTICIPANT_ID = '72000000-0000-4000-8000-000000000001'

test('group and expense lists can be filtered from compact search controls', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('connectionrefused'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Gemeinsam den Überblick behalten' })).toBeVisible()

  await page.evaluate(async ({ summerGroupId, winterGroupId, participantId }) => {
    const request = indexedDB.open('joinsplit', 10)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string }>((resolve, reject) => {
      identityRequest.onsuccess = () => resolve(identityRequest.result)
      identityRequest.onerror = () => reject(identityRequest.error)
    })
    const transaction = db.transaction(['groups', 'participants', 'expenses', 'expenseShares', 'pendingMutations'], 'readwrite')
    for (const store of ['groups', 'participants', 'expenses', 'expenseShares', 'pendingMutations']) {
      transaction.objectStore(store).clear()
    }
    transaction.objectStore('groups').put({
      id: summerGroupId,
      name: 'Sommerreise',
      currency: 'EUR',
      ownerAccessIdentityId: identity.id,
      status: 'active',
      hasFinancialHistory: true,
      participantIds: [participantId],
    })
    transaction.objectStore('groups').put({
      id: winterGroupId,
      name: 'Winterhütte',
      currency: 'EUR',
      ownerAccessIdentityId: identity.id,
      status: 'active',
      hasFinancialHistory: false,
      participantIds: [],
    })
    transaction.objectStore('participants').put({
      id: participantId,
      groupId: summerGroupId,
      name: 'Alice',
      status: 'active',
      order: 0,
    })
    transaction.objectStore('expenses').put({
      id: '73000000-0000-4000-8000-000000000001',
      groupId: summerGroupId,
      description: 'Hotel',
      amountMinor: 12000,
      incurredOn: '2026-09-20',
      payerParticipantId: participantId,
      creatorAccessIdentityId: identity.id,
      splitMethod: 'equal',
    })
    transaction.objectStore('expenseShares').put({
      expenseId: '73000000-0000-4000-8000-000000000001',
      participantId,
      amountMinor: 12000,
    })
    transaction.objectStore('expenses').put({
      id: '73000000-0000-4000-8000-000000000002',
      groupId: summerGroupId,
      description: 'Taxi',
      amountMinor: 2400,
      incurredOn: '2026-09-21',
      payerParticipantId: participantId,
      creatorAccessIdentityId: identity.id,
      splitMethod: 'equal',
    })
    transaction.objectStore('expenseShares').put({
      expenseId: '73000000-0000-4000-8000-000000000002',
      participantId,
      amountMinor: 2400,
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  }, {
    summerGroupId: SUMMER_GROUP_ID,
    winterGroupId: WINTER_GROUP_ID,
    participantId: PARTICIPANT_ID,
  })

  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/groups')
  await page.getByRole('button', { name: 'Gruppen durchsuchen' }).click()
  const groupSearch = page.getByRole('searchbox', { name: 'Gruppen durchsuchen', exact: true })
  await expect(groupSearch).toBeFocused()
  await groupSearch.fill('Sommer')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('link', { name: /Sommerreise/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Winterhütte/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Gruppen durchsuchen schließen' }).click()
  await expect(page.getByRole('link', { name: /Winterhütte/ })).toBeVisible()

  await page.getByRole('link', { name: /Sommerreise/ }).click()
  await page.getByRole('button', { name: 'Ausgaben durchsuchen' }).click()
  const expenseSearch = page.getByRole('searchbox', { name: 'Ausgaben durchsuchen', exact: true })
  await expenseSearch.fill('Taxi')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('link', { name: /Taxi/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Hotel/ })).toHaveCount(0)
  await expenseSearch.fill('Keine solche Ausgabe')
  await expect(page.getByText('Keine Ausgabe passt zu „Keine solche Ausgabe“.')).toBeVisible()
  await page.getByRole('button', { name: 'Ausgaben durchsuchen schließen' }).click()
  await expect(page.getByRole('link', { name: /Hotel/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Taxi/ })).toBeVisible()
})
