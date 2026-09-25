import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const GROUP_ID = '10000000-0000-4000-8000-000000000001'
const DEBTOR_ID = '20000000-0000-4000-8000-000000000001'
const CREDITOR_ID = '20000000-0000-4000-8000-000000000002'
const EXPENSE_ID = '30000000-0000-4000-8000-000000000001'
const SETTLEMENT_ID = '40000000-0000-4000-8000-000000000001'

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
}

async function seedSettlementState(
  page: Page,
  options: { archived?: boolean; inactiveDebtor?: boolean; settlement?: boolean } = {},
): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await page.evaluate(async ({ groupId, debtorId, creditorId, expenseId, settlementId, archived, inactiveDebtor, includeSettlement }) => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string }>((resolve, reject) => { identityRequest.onsuccess = () => resolve(identityRequest.result); identityRequest.onerror = () => reject(identityRequest.error) })
    const tx = db.transaction(['groups', 'participants', 'expenses', 'expenseShares', 'settlements', 'pendingMutations'], 'readwrite')
    for (const store of ['groups', 'participants', 'expenses', 'expenseShares', 'settlements', 'pendingMutations']) tx.objectStore(store).clear()
    tx.objectStore('groups').put({ id: groupId, name: 'Ausgleich', currency: 'EUR', ownerAccessIdentityId: identity.id, status: archived ? 'archived' : 'active', hasFinancialHistory: true, participantIds: [debtorId, creditorId] })
    tx.objectStore('participants').put({ id: debtorId, groupId, name: 'Dora', status: inactiveDebtor ? 'inactive' : 'active', order: 0 })
    tx.objectStore('participants').put({ id: creditorId, groupId, name: 'Chris', status: 'active', order: 1 })
    tx.objectStore('expenses').put({ id: expenseId, groupId, description: 'Hotel', amountMinor: 2000, incurredOn: '2026-09-24', payerParticipantId: creditorId, creatorAccessIdentityId: identity.id, splitMethod: 'equal' })
    tx.objectStore('expenseShares').put({ expenseId, participantId: debtorId, amountMinor: 1000 })
    tx.objectStore('expenseShares').put({ expenseId, participantId: creditorId, amountMinor: 1000 })
    if (includeSettlement) tx.objectStore('settlements').put({ id: settlementId, groupId, senderParticipantId: debtorId, receiverParticipantId: creditorId, amountMinor: '400', occurredOn: '2026-09-24', creatorAccessIdentityId: identity.id })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  }, {
    groupId: GROUP_ID,
    debtorId: DEBTOR_ID,
    creditorId: CREDITOR_ID,
    expenseId: EXPENSE_ID,
    settlementId: SETTLEMENT_ID,
    archived: options.archived ?? false,
    inactiveDebtor: options.inactiveDebtor ?? false,
    includeSettlement: options.settlement ?? false,
  })
}

test('Settlement CRUD persists locally, remains FIFO, and updates Balances immediately', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await page.evaluate(async ({ groupId, debtorId, creditorId, expenseId }) => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string }>((resolve, reject) => { identityRequest.onsuccess = () => resolve(identityRequest.result); identityRequest.onerror = () => reject(identityRequest.error) })
    const tx = db.transaction(['groups', 'participants', 'expenses', 'expenseShares', 'settlements', 'pendingMutations'], 'readwrite')
    for (const store of ['groups', 'participants', 'expenses', 'expenseShares', 'settlements', 'pendingMutations']) tx.objectStore(store).clear()
    tx.objectStore('groups').put({ id: groupId, name: 'Ausgleich', currency: 'EUR', ownerAccessIdentityId: identity.id, status: 'active', hasFinancialHistory: true, participantIds: [debtorId, creditorId] })
    tx.objectStore('participants').put({ id: debtorId, groupId, name: 'Dora', status: 'active', order: 0 })
    tx.objectStore('participants').put({ id: creditorId, groupId, name: 'Chris', status: 'active', order: 1 })
    tx.objectStore('expenses').put({ id: expenseId, groupId, description: 'Hotel', amountMinor: 2000, incurredOn: '2026-09-24', payerParticipantId: creditorId, creatorAccessIdentityId: identity.id, splitMethod: 'equal' })
    tx.objectStore('expenseShares').put({ expenseId, participantId: debtorId, amountMinor: 1000 })
    tx.objectStore('expenseShares').put({ expenseId, participantId: creditorId, amountMinor: 1000 })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  }, { groupId: GROUP_ID, debtorId: DEBTOR_ID, creditorId: CREDITOR_ID, expenseId: EXPENSE_ID })

  await page.goto(`/groups/${GROUP_ID}/balances`)
  await page.getByRole('link', { name: 'Zahlungen' }).click()
  await page.getByRole('link', { name: 'Zahlung erfassen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Zahlung erfassen' })).toBeFocused()
  await page.getByLabel('Gezahlt von').selectOption(DEBTOR_ID)
  await page.getByLabel('Gezahlt an').selectOption(CREDITOR_ID)
  await page.getByLabel('Betrag in Euro').fill('4,00')
  await page.getByRole('button', { name: 'Zahlung speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Zahlung' })).toBeFocused()
  await expect(page.getByText('4,00 €')).toBeVisible()

  await page.goto(`/groups/${GROUP_ID}/balances`)
  await expect(page.getByText('−6,00 €', { exact: true })).toBeVisible()
  await expect(page.getByText('+6,00 €', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Zahlungen' }).click()
  await page.getByRole('link', { name: /Dora → Chris/ }).click()
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.getByLabel('Gezahlt von')).toBeFocused()
  await page.getByLabel('Betrag in Euro').fill('5,00')
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Zahlung' })).toBeFocused()
  await expect(page.getByText('5,00 €')).toBeVisible()
  await page.reload()
  await expect(page.getByText('5,00 €')).toBeVisible()

  await page.getByRole('button', { name: 'Zahlung löschen' }).click()
  await page.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByText('Noch keine Zahlungen erfasst.')).toBeVisible()
  const mutationTypes = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const result = db.transaction('pendingMutations').objectStore('pendingMutations').getAll()
    const records = await new Promise<Array<{ type: string; createdOrder: number }>>((resolve, reject) => { result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error) })
    db.close(); return records.sort((left, right) => left.createdOrder - right.createdOrder).map(item => item.type)
  })
  expect(mutationTypes).toEqual(['CreateSettlement', 'UpdateSettlement', 'DeleteSettlement'])
})

test('active Participants can explicitly confirm a payment against the open balance direction', async ({ page }) => {
  await seedSettlementState(page)
  await page.goto(`/groups/${GROUP_ID}/settlements/new`)
  await page.getByLabel('Gezahlt von').selectOption(CREDITOR_ID)
  await page.getByLabel('Gezahlt an').selectOption(DEBTOR_ID)
  await page.getByLabel('Betrag in Euro').fill('4,00')
  await page.getByRole('button', { name: 'Zahlung speichern' }).click()

  const warning = page.getByRole('alert')
  await expect(warning).toContainText('entgegen der aktuell offenen Salden')
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' })
  await expect(confirm).toBeFocused()
  await expectNoAxeViolations(page)
  await confirm.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Zahlung' })).toBeVisible()
  await expect(page.getByText('4,00 €')).toBeVisible()
})

test('inactive Participants cannot exceed their open balance and validation focuses the correction field', async ({ page }) => {
  await seedSettlementState(page, { inactiveDebtor: true })
  await page.goto(`/groups/${GROUP_ID}/settlements/new`)
  await page.getByRole('button', { name: 'Zahlung speichern' }).click()
  await expect(page.getByRole('alert')).toHaveText('Die Zahlung konnte nicht gespeichert werden. Bitte prüfe das markierte Feld.')
  await expect(page.getByLabel('Gezahlt von')).toBeFocused()

  await page.getByLabel('Gezahlt von').selectOption(DEBTOR_ID)
  await page.getByLabel('Gezahlt an').selectOption(CREDITOR_ID)
  await page.getByLabel('Betrag in Euro').fill('11,00')
  await page.getByRole('button', { name: 'Zahlung speichern' }).click()

  await expect(page.getByRole('alert')).toContainText('Mit inaktiven Personen darf eine Zahlung nur einen offenen Saldo')
  await expect(page.getByLabel('Betrag in Euro')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Trotzdem speichern' })).toHaveCount(0)
})

test('archived Settlement routes remain directly readable and expose no write controls', async ({ page }) => {
  await seedSettlementState(page, { archived: true, settlement: true })

  await page.goto(`/groups/${GROUP_ID}/settlements`)
  await expect(page.getByRole('link', { name: /Dora → Chris/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Zahlung erfassen' })).toHaveCount(0)
  await expect(page.getByText('Diese archivierte Gruppe ist schreibgeschützt.')).toBeVisible()

  await page.goto(`/groups/${GROUP_ID}/settlements/new`)
  await expect(page.getByRole('alert')).toHaveText('Archivierte Gruppen können nicht geändert werden.')
  await expect(page.getByRole('button', { name: 'Zahlung speichern' })).toHaveCount(0)

  await page.goto(`/groups/${GROUP_ID}/settlements/${SETTLEMENT_ID}`)
  await expect(page.getByText('4,00 €')).toBeVisible()
  await expect(page.getByText('Diese archivierte Gruppe ist schreibgeschützt.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Zahlung löschen' })).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('delete confirmation has accessible dialog semantics and restores trigger focus on cancel', async ({ page }) => {
  await seedSettlementState(page, { settlement: true })
  await page.goto(`/groups/${GROUP_ID}/settlements/${SETTLEMENT_ID}`)
  const trigger = page.getByRole('button', { name: 'Zahlung löschen' })
  await trigger.click()

  const dialog = page.getByRole('alertdialog', { name: 'Zahlung löschen' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('a failed durable delete keeps the dialog actionable and guards repeated activation', async ({ page }) => {
  await page.addInitScript(() => {
    const originalDelete = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange): IDBRequest<undefined> {
      if (this.name === 'settlements' && localStorage.getItem('fail-settlement-delete') === '1') {
        const attempts = Number(localStorage.getItem('settlement-delete-attempts') ?? '0') + 1
        localStorage.setItem('settlement-delete-attempts', String(attempts))
        throw new DOMException('Forced Settlement delete failure', 'UnknownError')
      }
      return originalDelete.call(this, key)
    }
  })
  await seedSettlementState(page, { settlement: true })
  await page.evaluate(() => localStorage.setItem('fail-settlement-delete', '1'))
  await page.goto(`/groups/${GROUP_ID}/settlements/${SETTLEMENT_ID}`)
  await page.getByRole('button', { name: 'Zahlung löschen' }).click()

  const dialog = page.getByRole('alertdialog', { name: 'Zahlung löschen' })
  const confirm = page.getByRole('button', { name: 'Endgültig löschen' })
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('dialog .danger-button')!
    button.click()
    button.click()
  })

  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveText('Die Zahlung konnte nicht lokal gelöscht werden.')
  await expect(dialog).toHaveAttribute('aria-busy', 'false')
  await expect(confirm).toBeEnabled()
  await expect(confirm).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('settlement-delete-attempts'))).toBe('1')
  await expect(page.getByText('4,00 €')).toBeVisible()
})

test('long participant names reflow on Settlement list and detail at 320px', async ({ page }) => {
  await seedSettlementState(page, { settlement: true })
  const longName = 'TeilnehmernameOhneTrennzeichen'.repeat(3)
  await page.evaluate(async ({ debtorId, creditorId, longName }) => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const tx = db.transaction('participants', 'readwrite')
    const store = tx.objectStore('participants')
    const debtorRequest = store.get(debtorId)
    const creditorRequest = store.get(creditorId)
    const [debtor, creditor] = await Promise.all([
      new Promise<Record<string, unknown>>((resolve, reject) => { debtorRequest.onsuccess = () => resolve(debtorRequest.result); debtorRequest.onerror = () => reject(debtorRequest.error) }),
      new Promise<Record<string, unknown>>((resolve, reject) => { creditorRequest.onsuccess = () => resolve(creditorRequest.result); creditorRequest.onerror = () => reject(creditorRequest.error) }),
    ])
    store.put({ ...debtor, name: longName })
    store.put({ ...creditor, name: `${longName}Zwei` })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  }, { debtorId: DEBTOR_ID, creditorId: CREDITOR_ID, longName })
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(`/groups/${GROUP_ID}/settlements`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.getByRole('link', { name: new RegExp(longName) }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
