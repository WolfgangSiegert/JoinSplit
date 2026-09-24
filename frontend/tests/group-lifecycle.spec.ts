import { expect, test, type Page } from '@playwright/test'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ALICE_ID = '33333333-3333-4333-8333-333333333333'
const BOB_ID = '44444444-4444-4444-8444-444444444444'
const EXPENSE_ID = '55555555-5555-4555-8555-555555555555'
const MUTATION_ID = '66666666-6666-4666-8666-666666666666'

async function seed(page: Page, mode: 'archived-only' | 'history-pending' | 'clean'): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Deine Gruppen' })).toBeVisible()
  await page.evaluate(async ({ mode, ids }) => {
    const request = indexedDB.open('joinsplit')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string }>((resolve, reject) => {
      identityRequest.onsuccess = () => resolve(identityRequest.result); identityRequest.onerror = () => reject(identityRequest.error)
    })
    const stores = ['groups', 'participants', 'expenses', 'expenseShares', 'settlements', 'pendingMutations']
    const tx = db.transaction(stores, 'readwrite')
    for (const store of stores) tx.objectStore(store).clear()
    const status = mode === 'archived-only' ? 'archived' : 'active'
    const history = mode !== 'clean'
    tx.objectStore('groups').put({ id: ids.groupId, name: mode === 'clean' ? 'Leere Gruppe' : 'Sommerreise', currency: 'EUR', ownerAccessIdentityId: identity.id, status, hasFinancialHistory: history, participantIds: mode === 'clean' ? [ids.aliceId] : [ids.aliceId, ids.bobId] })
    tx.objectStore('participants').put({ id: ids.aliceId, groupId: ids.groupId, name: 'Alice', status: 'active', order: 0 })
    if (mode !== 'clean') tx.objectStore('participants').put({ id: ids.bobId, groupId: ids.groupId, name: 'Bob', status: 'active', order: 1 })
    if (mode === 'history-pending') {
      const expense = { id: ids.expenseId, groupId: ids.groupId, description: 'Hotel', amountMinor: 1000, incurredOn: '2026-09-24', payerParticipantId: ids.aliceId, creatorAccessIdentityId: identity.id, splitMethod: 'equal', shares: [{ participantId: ids.aliceId, amountMinor: 500 }, { participantId: ids.bobId, amountMinor: 500 }] }
      const { shares, ...expenseRecord } = expense
      tx.objectStore('expenses').put(expenseRecord)
      for (const share of shares) tx.objectStore('expenseShares').put({ expenseId: ids.expenseId, ...share })
      tx.objectStore('pendingMutations').put({ id: ids.mutationId, type: 'CreateExpense', groupId: ids.groupId, createdOrder: 0, payload: { expense } })
    }
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  }, { mode, ids: { groupId: GROUP_ID, aliceId: ALICE_ID, bobId: BOB_ID, expenseId: EXPENSE_ID, mutationId: MUTATION_ID } })
  await page.reload()
}

test('an archived-only home does not show the empty state and reveals the archive through its filter', async ({ page }) => {
  await seed(page, 'archived-only')
  await expect(page.getByText('Noch keine Gruppe')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Sommerreise/ })).toHaveCount(0)
  await page.getByLabel('Archivierte Gruppen anzeigen').check()
  await expect(page.getByRole('link', { name: /Sommerreise/ })).toBeVisible()
})

test('archives despite an open balance and pending FIFO, then stays read-only after reload', async ({ page }) => {
  await page.route('**/api/**', route => route.abort())
  await seed(page, 'history-pending')
  await page.getByRole('link', { name: /Sommerreise/ }).click()
  await page.getByRole('button', { name: 'Gruppe archivieren' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Es bestehen offene Salden')
  await expect(dialog).toContainText('1 ausstehende Änderung')
  await dialog.getByRole('button', { name: 'Jetzt archivieren' }).click()
  await expect(page.getByText(/Archiviert und schreibgeschützt/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ausgabe erfassen' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Gruppe reaktivieren' })).toBeFocused()
  await page.reload()
  await expect(page.getByText(/Archiviert und schreibgeschützt/)).toBeVisible()
  await page.getByRole('button', { name: 'Gruppe reaktivieren' }).click()
  await expect(page.getByText(/Archiviert und schreibgeschützt/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Gruppe archivieren' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Ausgabe erfassen' })).toBeVisible()
  const types = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit'); const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const get = db.transaction('pendingMutations').objectStore('pendingMutations').getAll()
    const records = await new Promise<Array<{ type: string; createdOrder: number }>>((resolve, reject) => { get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error) })
    db.close(); return records.sort((a, b) => a.createdOrder - b.createdOrder).map(record => record.type)
  })
  expect(types).toEqual(['CreateExpense', 'ArchiveGroup', 'ReactivateGroup'])
})

test('hard delete immediately hides a clean Group but retains an observable retry tombstone across reload', async ({ page }) => {
  await page.route('**/api/**', route => route.abort())
  await seed(page, 'clean')
  await page.getByRole('link', { name: /Leere Gruppe/ }).click()
  await page.getByRole('button', { name: 'Gruppe endgültig löschen' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Diese Aktion kann nicht rückgängig gemacht werden')
  await dialog.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByRole('heading', { name: 'Ausstehende Löschungen' })).toBeVisible()
  await expect(page.getByText('Noch keine Gruppe')).toHaveCount(0)
  await expect(page.getByText('Leere Gruppe')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ausstehende Löschungen' })).toBeVisible()
  await page.goto(`/groups/${GROUP_ID}`)
  await expect(page.getByRole('heading', { name: 'Gruppe nicht gefunden' })).toBeVisible()
})
