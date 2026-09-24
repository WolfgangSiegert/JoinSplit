import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const GROUP_ID = '51000000-0000-4000-8000-000000000001'
const ALICE_ID = '52000000-0000-4000-8000-000000000001'
const BOB_ID = '52000000-0000-4000-8000-000000000002'
const CAROL_ID = '52000000-0000-4000-8000-000000000003'
const EXPENSE_ID = '53000000-0000-4000-8000-000000000001'

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
}

async function seedProposalState(
  page: Page,
  options: {
    balances?: 'open' | 'zero'
    archived?: boolean
    strategy?: 'deterministic' | 'minimum-transfer'
  } = {},
): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()

  await page.evaluate(async ({ groupId, aliceId, bobId, carolId, expenseId, balances, archived, strategy }) => {
    const request = indexedDB.open('joinsplit', 4)
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
      name: 'Vorschlagsreise',
      currency: 'EUR',
      ownerAccessIdentityId: identity.id,
      status: archived ? 'archived' : 'active',
      hasFinancialHistory: balances === 'open',
      participantIds: [aliceId, bobId, carolId],
    })
    transaction.objectStore('participants').put({ id: aliceId, groupId, name: 'Alice', status: 'active', order: 0 })
    transaction.objectStore('participants').put({ id: bobId, groupId, name: 'Bob', status: 'active', order: 1 })
    transaction.objectStore('participants').put({ id: carolId, groupId, name: 'Carol', status: 'inactive', order: 2 })

    if (balances === 'open') {
      transaction.objectStore('expenses').put({
        id: expenseId,
        groupId,
        description: 'Gemeinsames Essen',
        amountMinor: 1500,
        incurredOn: '2026-09-24',
        payerParticipantId: aliceId,
        creatorAccessIdentityId: identity.id,
        splitMethod: 'equal',
      })
      for (const participantId of [aliceId, bobId, carolId]) {
        transaction.objectStore('expenseShares').put({ expenseId, participantId, amountMinor: 500 })
      }
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
    balances: options.balances ?? 'open',
    archived: options.archived ?? false,
    strategy: options.strategy ?? 'deterministic',
  })
}

async function storedFinancialMutationCounts(page: Page): Promise<{ settlements: number; pendingMutations: number }> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(['settlements', 'pendingMutations'])
    const count = (store: 'settlements' | 'pendingMutations') => new Promise<number>((resolve, reject) => {
      const countRequest = transaction.objectStore(store).count()
      countRequest.onsuccess = () => resolve(countRequest.result)
      countRequest.onerror = () => reject(countRequest.error)
    })
    const [settlements, pendingMutations] = await Promise.all([count('settlements'), count('pendingMutations')])
    db.close()
    return { settlements, pendingMutations }
  })
}

test('shows the deterministic proposal in stable order without recording payments', async ({ page }) => {
  await seedProposalState(page)
  await page.goto(`/groups/${GROUP_ID}/balances`)

  const proposal = page.getByRole('region', { name: 'Ausgleichsvorschlag' })
  await expect(proposal).toContainText('nur eine Rechenhilfe und keine erfasste Zahlung')
  await expect(proposal.getByLabel('Strategie')).toHaveValue('deterministic')
  const transfers = proposal.getByRole('list', { name: 'Vorgeschlagene Zahlungen' }).getByRole('listitem')
  await expect(transfers).toHaveCount(2)
  await expect(transfers.nth(0)).toContainText('Bob zahlt Alice')
  await expect(transfers.nth(0)).toContainText('5,00 €')
  await expect(transfers.nth(1)).toContainText('Carol (inaktiv) zahlt Alice')
  await expect(transfers.nth(1)).toContainText('5,00 €')
  await expect(storedFinancialMutationCounts(page)).resolves.toEqual({ settlements: 0, pendingMutations: 0 })
  await expectNoAxeViolations(page)

  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('does not substitute the deterministic proposal when minimum-transfer is selected', async ({ page }) => {
  await seedProposalState(page, { strategy: 'minimum-transfer' })
  await page.goto(`/groups/${GROUP_ID}/balances`)

  const proposal = page.getByRole('region', { name: 'Ausgleichsvorschlag' })
  await expect(proposal.getByLabel('Strategie')).toHaveValue('minimum-transfer')
  await expect(proposal.getByText('Diese Strategie ist noch nicht verfügbar.')).toBeVisible()
  await expect(proposal).toContainText('folgt in einem späteren Schritt')
  await expect(proposal.getByRole('list', { name: 'Vorgeschlagene Zahlungen' })).toHaveCount(0)

  await proposal.getByLabel('Strategie').selectOption('deterministic')
  await expect(proposal.getByRole('list', { name: 'Vorgeschlagene Zahlungen' })).toBeVisible()
  await page.reload()
  await expect(proposal.getByLabel('Strategie')).toHaveValue('deterministic')
  await expect(storedFinancialMutationCounts(page)).resolves.toEqual({ settlements: 0, pendingMutations: 0 })
})

test('a failed strategy write restores the stored selection and reports its own error', async ({ page }) => {
  await page.goto('/settings')
  const strategy = page.getByRole('combobox', { name: 'Standardstrategie' })
  const groupDefault = page.getByRole('checkbox', {
    name: 'Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen',
  })
  await expect(strategy).toHaveValue('deterministic')
  await expect(groupDefault).toBeEnabled()

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'settings') {
        throw new DOMException('Forced strategy persistence failure', 'QuotaExceededError')
      }
      return Reflect.apply(originalPut, this, args)
    }
  })

  await strategy.selectOption('minimum-transfer')
  await expect(page.getByRole('alert')).toHaveText('Die Strategie konnte nicht lokal gespeichert werden.')
  await expect(strategy).toHaveValue('deterministic')
  await expect(groupDefault).toBeEnabled()
})

test('both settings controls stay disabled until one complete-record write finishes', async ({ page }) => {
  await page.goto('/settings')
  const strategy = page.getByRole('combobox', { name: 'Standardstrategie' })
  const groupDefault = page.getByRole('checkbox', {
    name: 'Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen',
  })

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = Reflect.apply(originalPut, this, args)
      if (this.name !== 'settings') return request

      const originalAddEventListener = request.addEventListener.bind(request)
      Object.defineProperty(request, 'addEventListener', {
        value(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
          if (type !== 'success') {
            originalAddEventListener(type, listener, options)
            return
          }
          const testWindow = window as Window & { releaseSettingsWrite?: () => void }
          testWindow.releaseSettingsWrite = () => {
            const event = new Event('success')
            if (typeof listener === 'function') listener.call(request, event)
            else listener.handleEvent(event)
          }
        },
      })
      return request
    }
  })

  await strategy.selectOption('minimum-transfer')
  await expect(strategy).toBeDisabled()
  await expect(groupDefault).toBeDisabled()

  await page.evaluate(() => {
    const testWindow = window as Window & { releaseSettingsWrite?: () => void }
    testWindow.releaseSettingsWrite?.()
  })
  await expect(strategy).toBeEnabled()
  await expect(groupDefault).toBeEnabled()
  await expect(strategy).toHaveValue('minimum-transfer')
})

test('keeps the all-zero proposal and archived inactive participants readable', async ({ page }) => {
  await seedProposalState(page, { balances: 'zero', archived: true })
  await page.goto(`/groups/${GROUP_ID}/balances`)

  await expect(page.getByText('Diese archivierte Gruppe ist schreibgeschützt. Ihre Salden bleiben lesbar.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ausgleichsvorschlag' }).getByText('Es ist keine Ausgleichszahlung nötig.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Carol/ })).toContainText('Inaktiv')
  await expectNoAxeViolations(page)
})
