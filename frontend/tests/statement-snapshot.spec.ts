import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const GROUP_ID = '61000000-0000-4000-8000-000000000001'
const ALICE_ID = '62000000-0000-4000-8000-000000000001'
const BOB_ID = '62000000-0000-4000-8000-000000000002'
const SAM_ONE_ID = '62000000-0000-4000-8000-000000000003'
const SAM_TWO_ID = '62000000-0000-4000-8000-000000000004'
const EXPENSE_ID = '63000000-0000-4000-8000-000000000001'

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])
}

async function seedStatementState(
  page: Page,
  options: { archived?: boolean; pending?: boolean; strategy?: 'deterministic' | 'minimum-transfer' } = {},
): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await page.evaluate(async ({ groupId, aliceId, bobId, expenseId, archived, pending, strategy }) => {
    const request = indexedDB.open('joinsplit', 7)
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
      ['groups', 'participants', 'expenses', 'expenseShares', 'settlements', 'pendingMutations', 'settings'],
      'readwrite',
    )
    for (const store of ['groups', 'participants', 'expenses', 'expenseShares', 'settlements', 'pendingMutations']) {
      transaction.objectStore(store).clear()
    }
    transaction.objectStore('settings').put({
      key: 'preferences',
      addSelfAsParticipantByDefault: true,
      settlementProposalStrategy: strategy,
    })
    transaction.objectStore('groups').put({
      id: groupId,
      name: 'Hüttentour',
      currency: 'EUR',
      ownerAccessIdentityId: identity.id,
      status: archived ? 'archived' : 'active',
      hasFinancialHistory: true,
      participantIds: [aliceId, bobId],
    })
    transaction.objectStore('participants').put({ id: aliceId, groupId, name: 'Alice', status: 'active', order: 0 })
    transaction.objectStore('participants').put({ id: bobId, groupId, name: 'Bob', status: 'inactive', order: 1 })
    transaction.objectStore('expenses').put({
      id: expenseId,
      groupId,
      description: 'Abendessen',
      amountMinor: 2000,
      incurredOn: '2026-09-24',
      payerParticipantId: aliceId,
      creatorAccessIdentityId: identity.id,
      splitMethod: 'equal',
    })
    transaction.objectStore('expenseShares').put({ expenseId, participantId: aliceId, amountMinor: 1000 })
    transaction.objectStore('expenseShares').put({ expenseId, participantId: bobId, amountMinor: 1000 })
    if (pending) {
      transaction.objectStore('pendingMutations').put({
        id: '64000000-0000-4000-8000-000000000001',
        type: 'RenameParticipant',
        groupId,
        createdOrder: 0,
        payload: { participantId: aliceId, name: 'Alice', active: true, order: 0 },
      })
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
    expenseId: EXPENSE_ID,
    archived: options.archived ?? false,
    pending: options.pending ?? false,
    strategy: options.strategy ?? 'deterministic',
  })
}

async function durableCounts(page: Page): Promise<{ expenses: number; settlements: number; pending: number }> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 7)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(['expenses', 'settlements', 'pendingMutations'])
    const count = (name: string) => new Promise<number>((resolve, reject) => {
      const countRequest = transaction.objectStore(name).count()
      countRequest.onsuccess = () => resolve(countRequest.result)
      countRequest.onerror = () => reject(countRequest.error)
    })
    const [expenses, settlements, pending] = await Promise.all([
      count('expenses'), count('settlements'), count('pendingMutations'),
    ])
    db.close()
    return { expenses, settlements, pending }
  })
}

test('creates a frozen selectable snapshot and copies its exact text without financial mutations', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as typeof window & { copiedText?: string }).copiedText = text } },
    })
  })
  await seedStatementState(page, { pending: true })
  let releaseSync!: () => void
  const syncGate = new Promise<void>(resolve => { releaseSync = resolve })
  let observeSync!: () => void
  const syncObserved = new Promise<void>(resolve => { observeSync = resolve })
  await page.route(`**/api/groups/${GROUP_ID}/participants/${ALICE_ID}`, async (route) => {
    observeSync()
    await syncGate
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { id: ALICE_ID, groupId: GROUP_ID, name: 'Alice', active: true, order: 0 },
      }),
    })
  })
  await page.goto(`/groups/${GROUP_ID}/balances`)
  await syncObserved
  await page.getByRole('link', { name: 'Persönlichen Stand teilen' }).click()

  await expect(page.getByText('auch offline einen Text')).toBeVisible()
  await expect(page.getByText('nicht hochgeladen und gibt keinen Zugriff')).toBeVisible()
  const participant = page.getByLabel('Teilnehmer')
  await expect(participant.locator('option')).toHaveCount(3)
  await expect(participant.locator('option').nth(1)).toContainText('Alice')
  await expect(participant.locator('option').nth(1)).toContainText('+10,00')
  await expect(participant.locator('option').nth(2)).toContainText('Bob, inaktiv')
  await participant.selectOption(ALICE_ID)
  const before = await durableCounts(page)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  await expect(page.getByRole('heading', { name: 'Vorschau', exact: true })).toBeFocused()

  const preview = page.getByLabel('Textvorschau')
  const frozenText = await preview.inputValue()
  expect(frozenText).toContain('JoinSplit – Abrechnungsauszug')
  expect(frozenText).toContain('Person: Alice')
  expect(frozenText).toContain('Abendessen')
  expect(frozenText).toContain('noch nicht synchronisierte Änderungen')
  await expect(page.getByText('Der lokale Gruppenstand enthält noch nicht synchronisierte Änderungen.')).toBeVisible()
  expect(await durableCounts(page)).toEqual(before)

  releaseSync()
  await expect.poll(async () => (await durableCounts(page)).pending).toBe(0)
  await expect(preview).toHaveValue(frozenText)
  await expect(page.getByText('Der lokale Gruppenstand enthält noch nicht synchronisierte Änderungen.')).toBeVisible()

  await page.getByRole('button', { name: 'Text kopieren' }).click()
  await expect(page.getByText('Text wurde kopiert.')).toBeVisible()
  expect(await page.evaluate(() => (window as typeof window & { copiedText?: string }).copiedText)).toBe(frozenText)
  await expectNoAxeViolations(page)
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('shares only title and frozen text, handles cancellation neutrally, and regenerates for another participant', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => { (window as typeof window & { sharedData?: ShareData }).sharedData = data },
    })
  })
  await seedStatementState(page, { strategy: 'minimum-transfer' })
  await page.goto(`/groups/${GROUP_ID}/balances/statement`)
  await page.getByLabel('Teilnehmer').selectOption(ALICE_ID)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  const aliceText = await page.getByLabel('Textvorschau').inputValue()
  expect(aliceText).toContain('Vorgeschlagene Ausgleichszahlungen (Möglichst wenige Zahlungen)')
  await page.getByRole('button', { name: 'Systemdialog öffnen' }).click()
  const shared = await page.evaluate(() => (window as typeof window & { sharedData?: ShareData }).sharedData)
  expect(shared).toEqual({ title: 'JoinSplit – Abrechnungsauszug', text: aliceText })
  expect(shared).not.toHaveProperty('url')

  await page.getByRole('button', { name: 'Neue Vorschau erzeugen' }).click()
  await expect(page.getByRole('heading', { name: 'Vorschau erzeugen' })).toBeFocused()
  await page.getByLabel('Teilnehmer').selectOption(BOB_ID)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  await expect(page.getByLabel('Textvorschau')).toHaveValue(/Person: Bob \(inaktiv\)/)
  await expect(page.getByLabel('Textvorschau')).not.toHaveValue(aliceText)

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => { throw new DOMException('cancelled', 'AbortError') },
    })
  })
  await page.getByRole('button', { name: 'Systemdialog öffnen' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => { throw new Error('share failed') },
    })
  })
  await page.getByRole('button', { name: 'Systemdialog öffnen' }).click()
  await expect(page.getByRole('alert')).toContainText('Teilen war nicht möglich')
})

test('keeps manual selection available when browser APIs fail or are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  })
  await seedStatementState(page)
  await page.goto(`/groups/${GROUP_ID}/balances/statement`)
  await page.getByLabel('Teilnehmer').selectOption(ALICE_ID)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  await expect(page.getByRole('button', { name: 'Systemdialog öffnen' })).toHaveCount(0)
  await expect(page.getByText('Systemteilen ist auf diesem Gerät nicht verfügbar')).toBeVisible()
  await page.getByRole('button', { name: 'Text kopieren' }).click()
  await expect(page.getByRole('alert')).toContainText('manuell ausgewählt')
  await expect(page.getByLabel('Textvorschau')).toBeEditable({ editable: false })
})

test('works offline for archived groups and discards the runtime preview on reload', async ({ page, context }) => {
  await seedStatementState(page, { archived: true })
  await page.goto(`/groups/${GROUP_ID}/balances/statement`)
  await context.setOffline(true)
  await expect(page.getByText('Die Gruppe ist archiviert')).toBeVisible()
  await page.getByLabel('Teilnehmer').selectOption(BOB_ID)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  await expect(page.getByLabel('Textvorschau')).toHaveValue(/Gruppe: Hüttentour \(archiviert\)/)
  await expect(page.getByLabel('Textvorschau')).toHaveValue(/Person: Bob \(inaktiv\)/)
  await context.setOffline(false)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Vorschau erzeugen' })).toBeVisible()
  await expect(page.getByLabel('Textvorschau')).toHaveCount(0)
})

test('shows safe empty states for missing groups and groups without participants', async ({ page }) => {
  await seedStatementState(page)
  await page.goto('/groups/unknown/balances/statement')
  await expect(page.getByRole('heading', { name: 'Gruppe nicht gefunden' })).toBeVisible()

  await page.goto('/')
  await page.evaluate(async ({ groupId }) => {
    const request = indexedDB.open('joinsplit', 7)
    const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
    const transaction = db.transaction(['participants', 'groups', 'expenses', 'expenseShares'], 'readwrite')
    transaction.objectStore('participants').clear()
    transaction.objectStore('expenses').clear()
    transaction.objectStore('expenseShares').clear()
    const groupRequest = transaction.objectStore('groups').get(groupId)
    groupRequest.onsuccess = () => transaction.objectStore('groups').put({ ...groupRequest.result, participantIds: [] })
    await new Promise<void>(resolve => { transaction.oncomplete = () => resolve() })
    db.close()
  }, { groupId: GROUP_ID })
  await page.reload()
  await page.goto(`/groups/${GROUP_ID}/balances/statement`)
  await expect(page.getByText('keine Teilnehmer vorhanden')).toBeVisible()
})

test('distinguishes participants whose names, status, and balance are identical', async ({ page }) => {
  await seedStatementState(page)
  await page.evaluate(async ({ groupId, samOneId, samTwoId }) => {
    const request = indexedDB.open('joinsplit', 7)
    const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
    const transaction = db.transaction(['participants', 'groups'], 'readwrite')
    transaction.objectStore('participants').put({ id: samOneId, groupId, name: 'Sam', status: 'inactive', order: 2 })
    transaction.objectStore('participants').put({ id: samTwoId, groupId, name: 'Sam', status: 'inactive', order: 3 })
    const groupRequest = transaction.objectStore('groups').get(groupId)
    groupRequest.onsuccess = () => transaction.objectStore('groups').put({
      ...groupRequest.result,
      participantIds: [...groupRequest.result.participantIds, samOneId, samTwoId],
    })
    await new Promise<void>(resolve => { transaction.oncomplete = () => resolve() })
    db.close()
  }, { groupId: GROUP_ID, samOneId: SAM_ONE_ID, samTwoId: SAM_TWO_ID })
  await page.reload()
  await page.goto(`/groups/${GROUP_ID}/balances/statement`)

  const participant = page.getByLabel('Teilnehmer')
  await expect(participant.locator(`option[value="${SAM_ONE_ID}"]`)).toHaveText(/Sam \(Teilnehmer 3\), inaktiv – 0,00/)
  await expect(participant.locator(`option[value="${SAM_TWO_ID}"]`)).toHaveText(/Sam \(Teilnehmer 4\), inaktiv – 0,00/)
  await participant.selectOption(SAM_TWO_ID)
  await expect(participant).toHaveValue(SAM_TWO_ID)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  await expect(page.getByLabel('Textvorschau')).toHaveValue(/Person: Sam \(Teilnehmer 4\) \(inaktiv\)/)
})

test('long Group, Expense, and Participant values reflow at 320px', async ({ page }) => {
  await seedStatementState(page)
  const longToken = 'SehrLangerWertOhneTrennzeichen'.repeat(3)
  await page.evaluate(async ({ groupId, aliceId, expenseId, longToken }) => {
    const request = indexedDB.open('joinsplit', 7)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const tx = db.transaction(['groups', 'participants', 'expenses'], 'readwrite')
    const groups = tx.objectStore('groups')
    const participants = tx.objectStore('participants')
    const expenses = tx.objectStore('expenses')
    const groupRequest = groups.get(groupId)
    const participantRequest = participants.get(aliceId)
    const expenseRequest = expenses.get(expenseId)
    const [group, participant, expense] = await Promise.all([
      new Promise<Record<string, unknown>>((resolve, reject) => { groupRequest.onsuccess = () => resolve(groupRequest.result); groupRequest.onerror = () => reject(groupRequest.error) }),
      new Promise<Record<string, unknown>>((resolve, reject) => { participantRequest.onsuccess = () => resolve(participantRequest.result); participantRequest.onerror = () => reject(participantRequest.error) }),
      new Promise<Record<string, unknown>>((resolve, reject) => { expenseRequest.onsuccess = () => resolve(expenseRequest.result); expenseRequest.onerror = () => reject(expenseRequest.error) }),
    ])
    groups.put({ ...group, name: longToken })
    participants.put({ ...participant, name: longToken })
    expenses.put({ ...expense, description: `${longToken}${longToken}` })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  }, { groupId: GROUP_ID, aliceId: ALICE_ID, expenseId: EXPENSE_ID, longToken })

  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(`/groups/${GROUP_ID}`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.goto(`/groups/${GROUP_ID}/expenses/${EXPENSE_ID}`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
