import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type Request } from '@playwright/test'

interface DurableSnapshot {
  groups: Array<{ id: string; participantIds: string[] }>
  participants: Array<{ id: string; groupId: string; name: string; order: number }>
  expenses: Array<{ id: string; groupId: string; description: string }>
  shares: Array<{ expenseId: string; participantId: string; amountMinor: number }>
  pending: Array<{ id: string; type: string; groupId: string; createdOrder: number }>
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

async function expectMinimumTargetSize(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
}

async function focusWithKeyboard(page: Page, locator: Locator, maximumTabs = 10): Promise<void> {
  for (let attempt = 0; attempt < maximumTabs; attempt += 1) {
    await page.keyboard.press('Tab')
    if (await locator.evaluate(element => element === document.activeElement)) return
  }
  throw new Error('Keyboard focus did not reach the expected control.')
}

async function durableSnapshot(page: Page): Promise<DurableSnapshot> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 7)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(
      ['groups', 'participants', 'expenses', 'expenseShares', 'pendingMutations'],
      'readonly',
    )
    const getAll = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const result = transaction.objectStore(storeName).getAll()
      result.onsuccess = () => resolve(result.result as T[])
      result.onerror = () => reject(result.error)
    })
    const [groups, participants, expenses, shares, pending] = await Promise.all([
      getAll<{ id: string; participantIds: string[] }>('groups'),
      getAll<{ id: string; groupId: string; name: string; order: number }>('participants'),
      getAll<{ id: string; groupId: string; description: string }>('expenses'),
      getAll<{ expenseId: string; participantId: string; amountMinor: number }>('expenseShares'),
      getAll<{ id: string; type: string; groupId: string; createdOrder: number }>('pendingMutations'),
    ])
    db.close()
    return {
      groups,
      participants,
      expenses,
      shares,
      pending: pending.sort((left, right) => left.createdOrder - right.createdOrder),
    }
  })
}

test('a mixed offline Group, Participant, and Expense queue survives reload and synchronizes FIFO', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => localStorage.getItem('js019-offline') !== '1',
    })
  })
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('js019-offline', '1'))
  await page.reload()

  const apiRequests: Request[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('http://127.0.0.1:8001/api/')) apiRequests.push(request)
  })

  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await page.getByLabel('Gruppenname').fill('Offline-Kernflow')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByText('Offline. Die Gruppe bleibt lokal nutzbar und wird später synchronisiert.')).toBeVisible()
  const groupId = new URL(page.url()).pathname.split('/').at(-1)!

  await page.getByRole('link', { name: 'Personen' }).click()
  await page.getByLabel('Teilnehmer hinzufügen').fill('Bob')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.getByText('Bob', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bob umbenennen' }).click()
  await page.getByLabel('Neuer Name').fill('Bobby')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Bobby', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Ausgaben' }).click()
  await page.getByRole('link', { name: 'Ausgabe hinzufügen' }).click()
  await page.getByLabel('Beschreibung').fill('Offline-Abendessen')
  await page.getByLabel('Betrag in Euro').fill('10,01')
  await page.getByLabel('Bezahlt von').selectOption({ label: 'Alice' })
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Offline-Abendessen' })).toBeVisible()
  const expenseId = new URL(page.url()).pathname.split('/').at(-1)!
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByLabel('Beschreibung').fill('Aktualisiertes Offline-Abendessen')
  await page.getByLabel('Betrag in Euro').fill('12,01')
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Aktualisiertes Offline-Abendessen' })).toBeVisible()
  await page.getByRole('button', { name: 'Ausgabe löschen' }).click()
  await page.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Ausgaben' })).toBeVisible()

  await page.goto(`/groups/${groupId}/balances`)
  await expect(page.getByText('Noch keine Ausgaben oder Zahlungen. Alle Teilnehmer sind derzeit ausgeglichen.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Alice/ })).toContainText('Ausgeglichen: 0,00 €')
  await expect(page.getByRole('link', { name: /Bobby/ })).toContainText('Ausgeglichen: 0,00 €')

  const beforeReload = await durableSnapshot(page)
  expect(beforeReload.pending.map(mutation => mutation.type)).toEqual([
    'CreateGroup',
    'AddParticipant',
    'RenameParticipant',
    'CreateExpense',
    'UpdateExpense',
    'DeleteExpense',
  ])
  expect(beforeReload.pending.map(mutation => mutation.createdOrder)).toEqual([0, 1, 2, 3, 4, 5])
  expect(beforeReload.groups).toHaveLength(1)
  expect([...beforeReload.participants]
    .sort((left, right) => left.order - right.order)
    .map(participant => participant.name)).toEqual(['Alice', 'Bobby'])
  expect(beforeReload.expenses).toEqual([])
  expect(beforeReload.shares).toEqual([])
  expect(apiRequests).toEqual([])

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Salden' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Bobby/ })).toContainText('Ausgeglichen: 0,00 €')
  const afterReload = await durableSnapshot(page)
  expect(afterReload).toEqual(beforeReload)

  const createGroupResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/groups') && response.request().method() === 'POST',
  )
  const addParticipantResponse = page.waitForResponse(response =>
    response.url().endsWith('/participants') && response.request().method() === 'POST',
  )
  const renameParticipantResponse = page.waitForResponse(response =>
    response.url().includes('/participants/') && response.request().method() === 'PATCH',
  )
  const createExpenseResponse = page.waitForResponse(response =>
    response.url().endsWith('/expenses') && response.request().method() === 'POST',
  )
  const updateExpenseResponse = page.waitForResponse(response =>
    response.url().includes('/expenses/') && response.request().method() === 'PUT',
  )
  const deleteExpenseResponse = page.waitForResponse(response =>
    response.url().includes('/expenses/') && response.request().method() === 'DELETE',
  )
  await page.evaluate(() => {
    localStorage.removeItem('js019-offline')
    window.dispatchEvent(new Event('online'))
  })

  const responses = await Promise.all([
    createGroupResponse,
    addParticipantResponse,
    renameParticipantResponse,
    createExpenseResponse,
    updateExpenseResponse,
    deleteExpenseResponse,
  ])
  expect(responses.map(response => response.status())).toEqual([201, 201, 200, 201, 200, 204])
  expect(apiRequests.map(request => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([
    'POST /api/access-identities',
    'POST /api/groups',
    `POST /api/groups/${groupId}/participants`,
    expect.stringMatching(new RegExp(`^PATCH /api/groups/${groupId}/participants/[0-9a-f-]+$`)),
    `POST /api/groups/${groupId}/expenses`,
    `PUT /api/groups/${groupId}/expenses/${expenseId}`,
    `DELETE /api/groups/${groupId}/expenses/${expenseId}`,
  ])
  await expect.poll(async () => (await durableSnapshot(page)).pending).toEqual([])

  expect(responses[0]!.request().postDataJSON().groupId).toBe(beforeReload.groups[0]!.id)
  expect(beforeReload.participants.map(participant => participant.id)).toContain(
    responses[1]!.request().postDataJSON().participantId,
  )
  expect(responses[2]!.request().postDataJSON()).toEqual({ name: 'Bobby' })
  expect(responses[3]!.request().postDataJSON().expenseId).toBe(expenseId)
  expect(responses[4]!.request().postDataJSON()).toMatchObject({
    description: 'Aktualisiertes Offline-Abendessen',
    amountMinor: 1201,
  })

  await page.reload()
  await expect(page.getByRole('link', { name: /Bobby/ })).toContainText('Ausgeglichen: 0,00 €')
  const afterSync = await durableSnapshot(page)
  expect(afterSync.pending).toEqual([])
  expect(afterSync.groups).toHaveLength(1)
  expect([...afterSync.participants]
    .sort((left, right) => left.order - right.order)
    .map(participant => participant.name)).toEqual(['Alice', 'Bobby'])
  expect(afterSync.expenses).toEqual([])
  expect(afterSync.shares).toEqual([])
})

test('the mobile core flow stays accessible and free of horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  await expectNoAxeViolations(page)
  await expectNoHorizontalOverflow(page)

  const createGroupLink = page.getByRole('link', { name: 'Neue Gruppe' })
  await expectMinimumTargetSize(createGroupLink)
  await focusWithKeyboard(page, createGroupLink)
  await expect(createGroupLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Gruppe erstellen' })).toBeVisible()
  await page.getByLabel('Gruppenname').fill('Mobile Reise')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  const createGroupButton = page.getByRole('button', { name: 'Gruppe erstellen' })
  await expectMinimumTargetSize(createGroupButton)
  const createGroup = page.waitForResponse(response =>
    response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await createGroupButton.click()
  await createGroup
  await page.waitForURL(url => /^\/groups\/[0-9a-f-]{36}$/.test(url.pathname))
  const groupId = new URL(page.url()).pathname.split('/').at(-1)!
  await expectNoAxeViolations(page)
  await expectNoHorizontalOverflow(page)

  const createExpenseLink = page.getByRole('link', { name: 'Ausgabe hinzufügen' })
  await expectMinimumTargetSize(createExpenseLink)
  await createExpenseLink.click()
  await page.getByLabel('Beschreibung').fill('Frühstück')
  await page.getByLabel('Betrag in Euro').fill('8,40')
  await expect(page.getByRole('heading', { name: 'Vorschau der Aufteilung' })).toBeVisible()
  await expectNoAxeViolations(page)
  await expectNoHorizontalOverflow(page)

  const createExpenseButton = page.getByRole('button', { name: 'Ausgabe speichern' })
  await expectMinimumTargetSize(createExpenseButton)
  const createExpense = page.waitForResponse(response =>
    response.url().endsWith('/expenses') && response.status() === 201,
  )
  await createExpenseButton.click()
  await createExpense
  await expect(page.getByRole('heading', { level: 1, name: 'Frühstück' })).toBeVisible()
  await expectNoAxeViolations(page)
  await expectNoHorizontalOverflow(page)

  await page.goto(`/groups/${groupId}/balances`)
  await expect(page.getByText('Alle Teilnehmer sind ausgeglichen.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Alice/ })).toContainText('Ausgeglichen: 0,00 €')
  await expectNoAxeViolations(page)
  await expectNoHorizontalOverflow(page)
})

test('Participant hardening prevents duplicate clicks, confirms duplicate names, and explains referenced deletion', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await page.getByLabel('Gruppenname').fill('Participant-Härtung')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  const createGroup = page.waitForResponse(response =>
    response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await createGroup
  await page.waitForURL(url => /^\/groups\/[0-9a-f-]{36}$/.test(url.pathname))
  const groupId = new URL(page.url()).pathname.split('/').at(-1)!

  await page.getByRole('link', { name: 'Personen' }).click()
  const participantPosts: Request[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/participants') && request.method() === 'POST') {
      participantPosts.push(request)
    }
  })

  await page.getByLabel('Teilnehmer hinzufügen').fill('Bob')
  const addBob = page.waitForResponse(response =>
    response.url().endsWith('/participants') && response.status() === 201,
  )
  await page.getByRole('button', { name: 'Hinzufügen' }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await addBob
  await expect(page.getByText('Bob', { exact: true })).toHaveCount(1)
  expect(participantPosts).toHaveLength(1)
  await expect(page.getByLabel('Teilnehmer hinzufügen')).toBeFocused()

  await page.getByRole('link', { name: 'Ausgaben' }).click()
  await page.getByRole('link', { name: 'Ausgabe hinzufügen' }).click()
  const inlineParticipantPosts: Request[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/participants') && request.method() === 'POST') {
      inlineParticipantPosts.push(request)
    }
  })
  await page.getByLabel('Name der neuen Person').fill('Cara')
  const addCara = page.waitForResponse(response =>
    response.url().endsWith('/participants') && response.status() === 201,
  )
  await page.getByRole('button', { name: 'Hinzufügen' }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await addCara
  await expect(page.getByLabel('Bezahlt von').locator('option', { hasText: 'Cara' })).toHaveCount(1)
  expect(inlineParticipantPosts).toHaveLength(1)
  await expect(page.getByLabel('Name der neuen Person')).toBeFocused()

  await page.getByLabel('Beschreibung').fill('Referenzierte Ausgabe')
  await page.getByLabel('Betrag in Euro').fill('10,00')
  await page.getByLabel('Bezahlt von').selectOption({ label: 'Alice' })
  const createExpense = page.waitForResponse(response =>
    response.url().endsWith('/expenses') && response.status() === 201,
  )
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await createExpense

  await page.goto(`/groups/${groupId}/participants`)
  await expect(page.getByRole('button', { name: 'Alice löschen' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Bob löschen' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cara löschen' })).toHaveCount(0)
  await expect(page.getByText(
    'Kann wegen vorhandener Finanzdaten nicht gelöscht werden. Deaktiviere die Person, damit sie für neue Ausgaben nicht mehr auswählbar ist.',
  )).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Alice deaktivieren' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bob deaktivieren' })).toBeVisible()

  const participantPatches: Request[] = []
  page.on('request', (request) => {
    if (request.url().includes('/participants/') && request.method() === 'PATCH') {
      participantPatches.push(request)
    }
  })
  const deactivateBob = page.waitForResponse(response =>
    response.url().includes('/participants/') && response.request().method() === 'PATCH' && response.status() === 200,
  )
  await page.getByRole('button', { name: 'Bob deaktivieren' }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await deactivateBob
  expect(participantPatches).toHaveLength(1)

  await page.getByLabel('Teilnehmer hinzufügen').fill('  alice  ')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  const duplicateAlert = page.getByRole('alert')
  await expect(duplicateAlert).toContainText('Name bereits vorhanden')
  await expect(duplicateAlert).toContainText('Der Name „alice“ wird in dieser Gruppe bereits verwendet.')
  const confirmDuplicate = page.getByRole('button', { name: 'Trotzdem hinzufügen' })
  await expect(confirmDuplicate).toBeFocused()
  expect(participantPosts).toHaveLength(2)

  const addDuplicate = page.waitForResponse(response =>
    response.url().endsWith('/participants') && response.status() === 201,
  )
  await confirmDuplicate.click()
  await addDuplicate
  await expect(page.getByText('alice', { exact: true })).toBeVisible()
  expect(participantPosts).toHaveLength(3)

  await page.getByRole('button', { name: 'alice umbenennen', exact: true }).click()
  await page.getByLabel('Neuer Name').fill('  bob  ')
  await page.getByRole('button', { name: 'Speichern' }).click()
  const duplicateRenameAlert = page.getByRole('alert')
  await expect(duplicateRenameAlert).toContainText('Name bereits vorhanden')
  const confirmDuplicateRename = page.getByRole('button', { name: 'Trotzdem umbenennen' })
  await expect(confirmDuplicateRename).toBeFocused()
  const renameDuplicate = page.waitForResponse(response =>
    response.url().includes('/participants/') && response.request().method() === 'PATCH' && response.status() === 200,
  )
  await confirmDuplicateRename.evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await renameDuplicate
  expect(participantPatches).toHaveLength(2)
  await expect(page.getByRole('button', { name: 'bob umbenennen', exact: true })).toBeFocused()

  const participantDeletes: Request[] = []
  page.on('request', (request) => {
    if (request.url().includes('/participants/') && request.method() === 'DELETE') {
      participantDeletes.push(request)
    }
  })
  await page.getByRole('button', { name: 'bob löschen', exact: true }).click()
  const deleteDuplicate = page.waitForResponse(response =>
    response.url().includes('/participants/') && response.request().method() === 'DELETE' && response.status() === 204,
  )
  await page.getByRole('button', { name: 'Endgültig löschen' }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await deleteDuplicate
  expect(participantDeletes).toHaveLength(1)
  await expect(page.getByLabel('Teilnehmer hinzufügen')).toBeFocused()
  await expectNoAxeViolations(page)
})
