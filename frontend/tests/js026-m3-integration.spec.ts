import { expect, test, type Page, type Request, type Response } from '@playwright/test'

interface DurableState {
  pending: Array<{ type: string; createdOrder: number }>
  participants: Array<{ id: string; name: string; status: string }>
}

async function durableState(page: Page): Promise<DurableState> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 5)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(['pendingMutations', 'participants'], 'readonly')
    const pendingRequest = transaction.objectStore('pendingMutations').getAll()
    const participantRequest = transaction.objectStore('participants').getAll()
    const pending = await new Promise<Array<{ type: string; createdOrder: number }>>((resolve, reject) => {
      pendingRequest.onsuccess = () => resolve(pendingRequest.result)
      pendingRequest.onerror = () => reject(pendingRequest.error)
    })
    const participants = await new Promise<Array<{ id: string; name: string; status: string }>>((resolve, reject) => {
      participantRequest.onsuccess = () => resolve(participantRequest.result)
      participantRequest.onerror = () => reject(participantRequest.error)
    })
    db.close()
    return {
      pending: pending.sort((left, right) => left.createdOrder - right.createdOrder),
      participants,
    }
  })
}

test('M3 financial workflow survives offline reload and synchronizes through Laravel in FIFO order', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => localStorage.getItem('js026-offline') !== '1',
    })
  })
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('js026-offline', '1'))
  await page.reload()

  const apiRequests: Request[] = []
  const apiResponses: Response[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('http://127.0.0.1:8001/api/')) apiRequests.push(request)
  })
  page.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1:8001/api/')) apiResponses.push(response)
  })

  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await page.getByLabel('Gruppenname').fill('M3 Offline-Reise')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await page.waitForURL(url => /^\/groups\/[0-9a-f-]{36}$/.test(url.pathname))
  const groupId = new URL(page.url()).pathname.split('/').at(-1)!

  await page.getByRole('link', { name: 'Teilnehmer verwalten' }).click()
  await page.getByLabel('Teilnehmer hinzufügen').fill('Bob')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  const bob = (await durableState(page)).participants.find(participant => participant.name === 'Bob')!

  await page.getByRole('link', { name: 'Ausgaben' }).click()
  await page.getByRole('link', { name: 'Ausgabe erfassen' }).click()
  await page.getByLabel('Beschreibung').fill('Ferienwohnung')
  await page.getByLabel('Betrag in Euro').fill('10,00')
  await page.getByLabel('Bezahlt von').selectOption({ label: 'Alice' })
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ferienwohnung' })).toBeVisible()

  await page.goto(`/groups/${groupId}/participants`)
  await page.getByRole('button', { name: 'Bob deaktivieren' }).click()
  await expect(page.getByText('Inaktiv', { exact: true })).toBeVisible()

  await page.goto(`/groups/${groupId}/settlements/new`)
  await page.getByLabel('Gezahlt von').selectOption(bob.id)
  await page.getByLabel('Gezahlt an').selectOption({ label: 'Alice' })
  await page.getByLabel('Betrag in Euro').fill('2,00')
  await page.getByRole('button', { name: 'Zahlung speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Zahlung', exact: true })).toBeVisible()

  await page.goto(`/groups/${groupId}/balances/statement`)
  await page.getByLabel('Teilnehmer').selectOption(bob.id)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  await expect(page.getByText('Der lokale Gruppenstand enthält noch nicht synchronisierte Änderungen.')).toBeVisible()
  await expect(page.getByLabel('Textvorschau')).toHaveValue(/Offener Saldo: −3,00 €/u)

  await page.goto(`/groups/${groupId}`)
  await page.getByRole('button', { name: 'Gruppe archivieren' }).click()
  await page.getByRole('button', { name: 'Jetzt archivieren' }).click()
  await expect(page.getByText(/Archiviert und schreibgeschützt/)).toBeVisible()

  const beforeReload = await durableState(page)
  expect(beforeReload.pending.map(mutation => mutation.type)).toEqual([
    'CreateGroup',
    'AddParticipant',
    'CreateExpense',
    'DeactivateParticipant',
    'CreateSettlement',
    'ArchiveGroup',
  ])
  expect(beforeReload.pending.map(mutation => mutation.createdOrder)).toEqual([0, 1, 2, 3, 4, 5])
  expect(apiRequests).toEqual([])

  await page.reload()
  await expect(page.getByText(/Archiviert und schreibgeschützt/)).toBeVisible()
  expect(await durableState(page)).toEqual(beforeReload)

  await page.evaluate(() => {
    localStorage.removeItem('js026-offline')
    window.dispatchEvent(new Event('online'))
  })
  await expect.poll(async () => (await durableState(page)).pending).toEqual([])

  expect(apiRequests.map(request => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([
    'POST /api/access-identities',
    'POST /api/groups',
    `POST /api/groups/${groupId}/participants`,
    `POST /api/groups/${groupId}/expenses`,
    `PATCH /api/groups/${groupId}/participants/${bob.id}`,
    `POST /api/groups/${groupId}/settlements`,
    `PATCH /api/groups/${groupId}`,
  ])
  expect(apiResponses.map(response => response.status())).toEqual([201, 201, 201, 201, 200, 201, 200])

  await page.goto(`/groups/${groupId}/balances`)
  await expect(page.getByRole('link', { name: /Alice/ })).toContainText('+3,00 €')
  await expect(page.getByRole('link', { name: /Bob/ })).toContainText('−3,00 €')
  await page.goto(`/groups/${groupId}/balances/statement`)
  await page.getByLabel('Teilnehmer').selectOption(bob.id)
  await page.getByRole('button', { name: 'Vorschau erzeugen' }).click()
  await expect(page.getByText('Der lokale Gruppenstand enthält noch nicht synchronisierte Änderungen.')).toHaveCount(0)
  await expect(page.getByLabel('Textvorschau')).toHaveValue(/Offener Saldo: −3,00 €/u)

  await page.goto(`/groups/${groupId}`)
  const reactivateResponse = page.waitForResponse(response =>
    response.url().endsWith(`/api/groups/${groupId}`)
      && response.request().method() === 'PATCH'
      && response.status() === 200,
  )
  await page.getByRole('button', { name: 'Gruppe reaktivieren' }).click()
  await reactivateResponse
  await expect(page.getByRole('button', { name: 'Gruppe archivieren' })).toBeVisible()
  await expect.poll(async () => (await durableState(page)).pending).toEqual([])
})
