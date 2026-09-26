import { expect, test } from '@playwright/test'

const password = 'correct horse battery staple'

test('registers, rehydrates on a new signed-in device, and deletes the Account', async ({ page }) => {
  const email = `account-${Date.now()}@example.test`

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
  await page.goto('/account')
  await expect(page.getByText(email)).toBeVisible()

  await page.getByLabel('Passwort bestätigen').fill(password)
  await page.getByRole('button', { name: 'Account endgültig löschen' }).click()
  await expect(page).toHaveURL('/')
})
