import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const GROUP_ID = '10000000-0000-4000-8000-000000000001'
const ALICE_ID = '20000000-0000-4000-8000-000000000001'
const BOB_ID = '20000000-0000-4000-8000-000000000002'
const CAROL_ID = '20000000-0000-4000-8000-000000000003'
const EXPENSE_ID = '30000000-0000-4000-8000-000000000001'

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
}

async function seedBalanceState(
  page: Page,
  options: { participants?: boolean; expenses?: 'none' | 'mixed' | 'balanced'; archived?: boolean } = {},
): Promise<void> {
  const participants = options.participants ?? true
  const expenses = options.expenses ?? 'mixed'
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()

  await page.evaluate(async ({ groupId, aliceId, bobId, carolId, expenseId, participants, expenses, archived }) => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string }>((resolve, reject) => {
      identityRequest.onsuccess = () => resolve(identityRequest.result)
      identityRequest.onerror = () => reject(identityRequest.error)
    })
    const transaction = db.transaction(
      ['groups', 'participants', 'expenses', 'expenseShares', 'pendingMutations'],
      'readwrite',
    )
    for (const store of ['groups', 'participants', 'expenses', 'expenseShares', 'pendingMutations']) {
      transaction.objectStore(store).clear()
    }
    transaction.objectStore('groups').put({
      id: groupId,
      name: 'Balance-Reise',
      currency: 'EUR',
      ownerAccessIdentityId: identity.id,
      status: archived ? 'archived' : 'active',
      hasFinancialHistory: expenses !== 'none',
      participantIds: participants ? [aliceId, bobId, carolId] : [],
    })
    if (participants) {
      transaction.objectStore('participants').put({ id: aliceId, groupId, name: 'Alice', status: 'active', order: 0 })
      transaction.objectStore('participants').put({ id: bobId, groupId, name: 'Bob', status: 'active', order: 1 })
      transaction.objectStore('participants').put({ id: carolId, groupId, name: 'Carol', status: 'inactive', order: 2 })
    }
    if (expenses === 'mixed') {
      transaction.objectStore('expenses').put({
        id: expenseId,
        groupId,
        description: 'Abendessen',
        amountMinor: 1001,
        incurredOn: '2026-09-24',
        payerParticipantId: aliceId,
        creatorAccessIdentityId: identity.id,
        splitMethod: 'equal',
      })
      transaction.objectStore('expenseShares').put({ expenseId, participantId: aliceId, amountMinor: 501 })
      transaction.objectStore('expenseShares').put({ expenseId, participantId: bobId, amountMinor: 500 })
    }
    if (expenses === 'balanced') {
      transaction.objectStore('expenses').put({
        id: expenseId,
        groupId,
        description: 'Eigene Ausgabe',
        amountMinor: 100,
        incurredOn: '2026-09-24',
        payerParticipantId: aliceId,
        creatorAccessIdentityId: identity.id,
        splitMethod: 'equal',
      })
      transaction.objectStore('expenseShares').put({ expenseId, participantId: aliceId, amountMinor: 100 })
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  }, {
    groupId: GROUP_ID,
    aliceId: ALICE_ID,
    bobId: BOB_ID,
    carolId: CAROL_ID,
    expenseId: EXPENSE_ID,
    participants,
    expenses,
    archived: options.archived ?? false,
  })
}

test('balance overview and participant composition use local data, stable order, and explicit wording', async ({ page, context }) => {
  await seedBalanceState(page)
  await page.goto(`/groups/${GROUP_ID}/balances`)

  await expect(page.getByRole('heading', { level: 1, name: 'Salden' })).toBeVisible()
  await expect(page.getByText('Berechnet aus den lokal gespeicherten Ausgaben und Zahlungen dieser Gruppe.')).toBeVisible()
  const items = page.locator('section[aria-labelledby="participant-balances"] li')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('Alice')
  await expect(items.nth(0)).toContainText('Soll erhalten: +5,00 €')
  await expect(items.nth(1)).toContainText('Bob')
  await expect(items.nth(1)).toContainText('Soll zahlen: −5,00 €')
  await expect(items.nth(2)).toContainText('Carol')
  await expect(items.nth(2)).toContainText('Inaktiv')
  await expect(items.nth(2)).toContainText('Ausgeglichen: 0,00 €')
  await expect(page.getByRole('link', { name: 'Salden' })).toHaveAttribute('aria-current', 'page')
  await expectNoAxeViolations(page)

  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await context.setOffline(true)
  await expect(items.nth(0)).toContainText('Soll erhalten: +5,00 €')
  await context.setOffline(false)
  await page.getByRole('link', { name: /Alice/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Alice' })).toBeVisible()
  const composition = page.getByRole('region', { name: 'Zusammensetzung' })
  await expect(composition).toContainText('Ausgaben bezahlt')
  await expect(composition).toContainText('+10,01 €')
  await expect(composition).toContainText('Eigene Anteile')
  await expect(composition).toContainText('−5,01 €')
  await expect(composition).toContainText('Aktueller Saldo')
  await expect(composition).toContainText('+5,00 €')
  const relevantExpense = page.getByRole('link', { name: /Abendessen/ })
  await expect(relevantExpense).toContainText('Bezahlt')
  await expect(relevantExpense).toContainText('+10,01 €')
  await expect(relevantExpense).toContainText('Eigener Anteil')
  await expect(relevantExpense).toContainText('−5,01 €')
  await expectNoAxeViolations(page)
})

test('real local Expense create, edit, and delete recalculate balances immediately before sync', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('connectionrefused'))
  await page.goto('/groups/new')
  await page.getByLabel('Gruppenname').fill('CRUD-Balance')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'CRUD-Balance' })).toBeVisible()

  await page.getByRole('link', { name: 'Personen' }).click()
  await page.getByLabel('Teilnehmer hinzufügen').fill('Bob')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.getByText('Bob', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Ausgaben' }).click()

  await page.getByRole('link', { name: 'Ausgabe hinzufügen' }).click()
  await page.getByLabel('Beschreibung').fill('Abendessen')
  await page.getByLabel('Betrag in Euro').fill('10,01')
  await page.getByLabel('Bezahlt von').selectOption({ label: 'Alice' })
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Abendessen' })).toBeVisible()

  await page.getByRole('link', { name: '← Ausgaben' }).click()
  await page.getByRole('link', { name: 'Salden' }).click()
  await expect(page.getByRole('link', { name: /Alice/ })).toContainText('Soll erhalten: +5,00 €')
  await expect(page.getByRole('link', { name: /Bob/ })).toContainText('Soll zahlen: −5,00 €')

  await page.getByRole('link', { name: 'Ausgaben' }).click()
  await page.getByRole('link', { name: /Abendessen/ }).click()
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByLabel('Betrag in Euro').fill('12,01')
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByText('Änderungen wurden lokal gespeichert.')).toBeVisible()

  await page.getByRole('link', { name: '← Ausgaben' }).click()
  await page.getByRole('link', { name: 'Salden' }).click()
  await expect(page.getByRole('link', { name: /Alice/ })).toContainText('Soll erhalten: +6,00 €')
  await expect(page.getByRole('link', { name: /Bob/ })).toContainText('Soll zahlen: −6,00 €')

  await page.getByRole('link', { name: 'Ausgaben' }).click()
  await page.getByRole('link', { name: /Abendessen/ }).click()
  await page.getByRole('button', { name: 'Ausgabe löschen' }).click()
  await page.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Ausgaben' })).toBeVisible()
  await page.getByRole('link', { name: 'Salden' }).click()
  await expect(page.getByText('Noch keine Ausgaben oder Zahlungen. Alle Teilnehmer sind derzeit ausgeglichen.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Alice/ })).toContainText('Ausgeglichen: 0,00 €')
  await expect(page.getByRole('link', { name: /Bob/ })).toContainText('Ausgeglichen: 0,00 €')
})

test('reload preserves balances and an archived Group remains readable', async ({ page }) => {
  await seedBalanceState(page, { archived: true })
  await page.goto(`/groups/${GROUP_ID}/balances`)
  await expect(page.getByText('Diese archivierte Gruppe ist schreibgeschützt. Ihre Salden bleiben lesbar.')).toBeVisible()
  await expect(page.getByText('Soll erhalten: +5,00 €')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Soll zahlen: −5,00 €')).toBeVisible()
  await page.getByRole('link', { name: /Carol/ }).click()
  await expect(page.getByText('Inaktiver Teilnehmer')).toBeVisible()
  await expect(page.getByText('Diese archivierte Gruppe ist schreibgeschützt. Der finanzielle Stand bleibt lesbar.')).toBeVisible()
  await expectNoAxeViolations(page)
})

test('empty Participant, no Expense, and all-balanced states are distinct and accessible', async ({ page }) => {
  await seedBalanceState(page, { participants: false, expenses: 'none' })
  await page.goto(`/groups/${GROUP_ID}/balances`)
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Teilnehmer' })).toBeVisible()
  await expect(page.getByText('Alle Teilnehmer sind derzeit ausgeglichen.')).toHaveCount(0)
  await expectNoAxeViolations(page)

  await seedBalanceState(page, { expenses: 'none' })
  await page.goto(`/groups/${GROUP_ID}/balances`)
  await expect(page.getByText('Noch keine Ausgaben oder Zahlungen. Alle Teilnehmer sind derzeit ausgeglichen.')).toBeVisible()
  await expect(page.getByText('Ausgeglichen: 0,00 €')).toHaveCount(3)

  await seedBalanceState(page, { expenses: 'balanced' })
  await page.goto(`/groups/${GROUP_ID}/balances`)
  await expect(page.getByText('Alle Teilnehmer sind ausgeglichen.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Alice/ })).toContainText('Ausgeglichen: 0,00 €')
  await expectNoAxeViolations(page)
})
