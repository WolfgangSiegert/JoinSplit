import { expect, test } from '@playwright/test'

const GROUP_ID = '81000000-0000-4000-8000-000000000001'
const participantIds = Array.from({ length: 6 }, (_, index) => `82000000-0000-4000-8000-00000000000${index + 1}`)
const expenseIds = Array.from({ length: 6 }, (_, index) => `83000000-0000-4000-8000-00000000000${index + 1}`)

test('participant balances grow with the page while long expense lists remain internally scrollable', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('connectionrefused'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Gemeinsam den Überblick behalten' })).toBeVisible()

  await page.evaluate(async ({ groupId, participantIds: ids, expenseIds: expenses }) => {
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
    for (const store of ['groups', 'participants', 'expenses', 'expenseShares', 'pendingMutations']) transaction.objectStore(store).clear()
    transaction.objectStore('groups').put({
      id: groupId,
      name: 'Scrolltest',
      currency: 'EUR',
      ownerAccessIdentityId: identity.id,
      status: 'active',
      hasFinancialHistory: true,
      participantIds: ids,
    })
    ids.forEach((id, index) => transaction.objectStore('participants').put({
      id, groupId, name: `Person ${index + 1}`, status: 'active', order: index,
    }))
    expenses.forEach((id, index) => {
      transaction.objectStore('expenses').put({
        id,
        groupId,
        description: `Ausgabe ${index + 1}`,
        amountMinor: 600 + index * 60,
        incurredOn: `2026-09-${String(10 + index).padStart(2, '0')}`,
        payerParticipantId: ids[index],
        creatorAccessIdentityId: identity.id,
        splitMethod: 'equal',
      })
      ids.forEach(participantId => transaction.objectStore('expenseShares').put({
        expenseId: id, participantId, amountMinor: 100 + index * 10,
      }))
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  }, { groupId: GROUP_ID, participantIds, expenseIds })

  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto(`/groups/${GROUP_ID}`)

  const groupHeading = page.locator('.group-view-heading')
  await expect(groupHeading.locator('.group-view-heading__group-name')).toHaveText('Scrolltest')
  await expect(groupHeading.locator('.group-view-heading__group-meta')).toContainText('6 Personen')
  await expect(groupHeading.locator('.group-view-heading__group-meta')).toContainText('EUR')
  await expect(groupHeading.getByText('6 Personen · EUR', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Salden pro Teilnehmer' })).toHaveCount(0)
  const expenseList = page.getByRole('list', { name: 'Ausgabenliste' })
  await expect(expenseList.getByRole('listitem')).toHaveCount(6)
  await expect(page.getByText('Weitere Ausgaben')).toBeVisible()
  expect(await expenseList.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await expenseList.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect(page.getByText('Weitere Ausgaben')).toHaveCount(0)

  await page.getByRole('navigation', { name: 'Gruppenbereiche' }).getByRole('link', { name: 'Leute' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Leute' })).toBeVisible()
  await expect(page.locator('#participant-form')).toHaveCount(0)
  await page.getByRole('button', { name: 'Teilnehmeraufnahme öffnen' }).click()
  await expect(page.getByLabel('Teilnehmer hinzufügen')).toBeFocused()
  await page.getByRole('button', { name: 'Teilnehmeraufnahme schließen' }).click()
  await expect(page.locator('#participant-form')).toHaveCount(0)
  const balances = page.getByRole('list', { name: 'Teilnehmer und Salden' })
  await expect(balances.getByRole('listitem')).toHaveCount(6)
  await expect(balances.locator('.balance-overview__bar--negative')).toHaveCount(3)
  await expect(balances.locator('.balance-overview__bar--positive')).toHaveCount(3)
  await expect(balances.getByText('zahlt')).toHaveCount(3)
  await expect(balances.getByText('erhält')).toHaveCount(3)
  const firstParticipant = balances.getByRole('listitem').first()
  const amountBox = await firstParticipant.locator('.participant-entry__amount').boundingBox()
  const balanceBox = await firstParticipant.locator('.participant-entry__balance').boundingBox()
  expect(amountBox).not.toBeNull()
  expect(balanceBox).not.toBeNull()
  const legendZeroBox = await page.locator('.participant-list__legend .balance-overview__legend-zero').boundingBox()
  expect(legendZeroBox).not.toBeNull()
  expect(Math.abs((legendZeroBox!.x + legendZeroBox!.width / 2) - (balanceBox!.x + balanceBox!.width / 2))).toBeLessThanOrEqual(1)
  await expect(firstParticipant.locator('.participant-entry__quick-actions')).toBeHidden()
  await firstParticipant.getByLabel('Details zu Person 1').click()
  await expect(firstParticipant.locator('.participant-entry__mobile-actions')).toBeVisible()
  await firstParticipant.getByRole('button', { name: 'Umbenennen', exact: true }).click()
  const contentBox = await firstParticipant.locator('.participant-entry__content').boundingBox()
  const participantBox = await firstParticipant.boundingBox()
  expect(contentBox).not.toBeNull()
  expect(participantBox).not.toBeNull()
  expect(Math.abs(contentBox!.x - participantBox!.x)).toBeLessThanOrEqual(1)
  expect(Math.abs((contentBox!.x + contentBox!.width) - (participantBox!.x + participantBox!.width))).toBeLessThanOrEqual(1)
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByText('Weitere Teilnehmer')).toHaveCount(0)
  expect(await balances.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)

  await firstParticipant.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await page.goto('/settings')
  await page.getByRole('radio', { name: 'English' }).check()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await page.goto(`/groups/${GROUP_ID}/participants`)
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Participants and balances' }).getByText('receives')).toHaveCount(3)
  await expect(page.getByRole('list', { name: 'Participants and balances' }).getByText('pays')).toHaveCount(3)
  await page.getByLabel('Details for Person 1').click()
  await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeVisible()
})
