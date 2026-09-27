import { expect, test } from '@playwright/test'

const password = 'correct horse battery staple'

test('requests a recovery link without Account disclosure and completes the reset-link UI', async ({ page }) => {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = []
  await page.route('**/api/account/password/**', async (route) => {
    requests.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() })
    await route.fulfill({ status: route.request().url().endsWith('/forgot') ? 202 : 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/account')
  await page.getByRole('button', { name: 'Passwort vergessen?' }).click()
  await page.getByLabel('E-Mail').fill('owner@example.test')
  await page.getByRole('button', { name: 'Link anfordern' }).click()
  await expect(page.getByRole('status')).toHaveText('Prüfe dein Postfach. Falls ein Account existiert, wurde ein Link versendet.')

  await page.goto('/account/reset?token=reset-token&email=owner%40example.test')
  await expect(page.getByRole('heading', { name: 'Neues Passwort' })).toBeVisible()
  await expect(page.getByLabel('E-Mail')).toHaveValue('owner@example.test')
  await page.getByLabel('Neues Passwort').fill('new correct horse battery staple')
  await page.getByRole('button', { name: 'Passwort speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.')

  expect(requests).toEqual([
    { path: '/api/account/password/forgot', body: { email: 'owner@example.test' } },
    { path: '/api/account/password/reset', body: {
      email: 'owner@example.test', token: 'reset-token', password: 'new correct horse battery staple',
      password_confirmation: 'new correct horse battery staple',
    } },
  ])
})

test('registers, rehydrates on a new signed-in device, and deletes the Account', async ({ page }) => {
  const email = `account-${Date.now()}@example.test`

  await page.goto('/people')
  await page.getByLabel('Name').fill('Ada Account')
  await page.getByRole('button', { name: 'Person anlegen' }).click()
  await expect(page.getByText('Ada Account', { exact: true })).toBeVisible()

  await page.goto('/account')
  await page.getByRole('button', { name: 'Registrieren' }).click()
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Registrieren und Daten übernehmen' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Angemeldet' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await page.goto('/people')
  await expect(page.getByText('Ada Account', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ada Account bearbeiten' }).click()
  await page.getByLabel('Name').fill('Ada Synced')
  await page.getByRole('button', { name: 'Änderung speichern' }).click()
  await expect(page.getByText('Ada Synced', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('joinsplit')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const count = database.transaction('pendingPersonMutations').objectStore('pendingPersonMutations').count()
    return await new Promise<number>((resolve, reject) => {
      count.onsuccess = () => resolve(count.result); count.onerror = () => reject(count.error)
    })
  })).toBe(0)

  await page.goto('/groups/new')
  await page.getByLabel('Gruppenname').fill('Account Group')
  await page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' }).uncheck()
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+\?created=1$/u)
  const groupId = new URL(page.url()).pathname.split('/').at(-1)!
  await page.goto(`/groups/${groupId}/participants`)
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Synced' })
  await page.getByRole('button', { name: 'Ausgewählte Person hinzufügen' }).click()
  await expect(page.getByText('Aktiv · Aus Personenverzeichnis')).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('joinsplit')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const count = database.transaction('pendingMutations').objectStore('pendingMutations').count()
    return await new Promise<number>((resolve, reject) => {
      count.onsuccess = () => resolve(count.result); count.onerror = () => reject(count.error)
    })
  })).toBe(0)

  await page.goto('/account')
  const clientStorage = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['accessIdentity', 'accountWorkspace'], 'readonly')
    const identityRequest = transaction.objectStore('accessIdentity').get('current')
    const workspaceRequest = transaction.objectStore('accountWorkspace').get('current')
    const [identity, workspace] = await Promise.all([
      new Promise<Record<string, unknown>>((resolve, reject) => { identityRequest.onsuccess = () => resolve(identityRequest.result); identityRequest.onerror = () => reject(identityRequest.error) }),
      new Promise<Record<string, unknown>>((resolve, reject) => { workspaceRequest.onsuccess = () => resolve(workspaceRequest.result); workspaceRequest.onerror = () => reject(workspaceRequest.error) }),
    ])
    return { identity, workspace, localStorageKeys: Object.keys(localStorage) }
  })
  expect(clientStorage.identity.credential).toBeNull()
  expect(clientStorage.identity.synchronizationStatus).toBe('account-linked')
  expect(clientStorage.workspace.email).toBe(email)
  expect(clientStorage.localStorageKeys).toEqual([])

  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/account')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Anmelden und Daten übernehmen' }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/people')
  await expect(page.getByText('Ada Synced', { exact: true })).toBeVisible()
  await page.goto(`/groups/${groupId}/participants`)
  await expect(page.getByText('Aktiv · Aus Personenverzeichnis')).toBeVisible()
  await page.goto('/account')
  await expect(page.getByText(email)).toBeVisible()

  await page.getByLabel('Passwort bestätigen').fill(password)
  await page.getByRole('button', { name: 'Account endgültig löschen' }).click()
  await expect(page).toHaveURL('/')
})
