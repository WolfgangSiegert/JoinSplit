import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
})

test('the in-memory global setting controls the next form default', async ({ page }) => {
  await page.getByRole('link', { name: 'Gruppen' }).click()
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await page
    .getByRole('checkbox', { name: 'Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen' })
    .uncheck()
  await page.getByRole('link', { name: 'Gruppen' }).click()
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()

  await expect(page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' })).not.toBeChecked()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toHaveCount(0)
})

test('Create Group is reachable with the approved default and dependent field', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Gruppe erstellen' })).toBeVisible()
  const checkbox = page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' })
  await expect(checkbox).toBeChecked()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toBeVisible()
  await expect(page.getByText('EUR', { exact: true })).toBeVisible()
  await expectNoAxeViolations(page)

  await checkbox.uncheck()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toHaveCount(0)
})

test('validation preserves input, associates errors, and focuses the first invalid field', async ({ page }) => {
  await page.getByLabel('Gruppenname').fill('   ')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Wolfgang')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()

  const groupName = page.getByLabel('Gruppenname')
  await expect(groupName).toBeFocused()
  await expect(groupName).toHaveValue('   ')
  await expect(groupName).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Gruppenname ist erforderlich.')).toBeVisible()
  await expectNoAxeViolations(page)

  await groupName.fill('Reise')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('   ')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toBeFocused()
})

test('local creation navigates immediately, then the real API confirms the same group idempotently', async ({ page }) => {
  let releaseRequest!: () => void
  const requestGate = new Promise<void>(resolve => { releaseRequest = resolve })
  let capturedRequest: { body: string; headers: Record<string, string> } | undefined
  await page.route('**/api/groups', async route => {
    capturedRequest = {
      body: route.request().postData() ?? '',
      headers: await route.request().allHeaders(),
    }
    await requestGate
    await route.continue()
  })

  await page.getByLabel('Gruppenname').fill('  Wochenendtrip  ')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('  Wolfgang  ')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).dblclick()

  const heading = page.getByRole('heading', { level: 1, name: 'Wochenendtrip' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+\?created=1$/)
  await expect(page.getByText('Gruppe lokal erstellt.')).toBeVisible()
  await expect(page.getByText('Synchronisierung läuft. Die Gruppe bleibt lokal nutzbar.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Ausgaben' })).toBeVisible()

  const groupId = new URL(page.url()).pathname.split('/').at(-1)!
  const serverResponsePromise = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.request().method() === 'POST',
  )
  releaseRequest()
  const serverResponse = await serverResponsePromise
  expect(serverResponse.status()).toBe(201)
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  expect(JSON.parse(capturedRequest!.body).groupId).toBe(groupId)
  await expectNoAxeViolations(page)

  const retryResponse = await page.request.post('http://127.0.0.1:8001/api/groups', {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Access-Identity-ID': capturedRequest!.headers['x-access-identity-id']!,
      Authorization: capturedRequest!.headers.authorization!,
    },
    data: JSON.parse(capturedRequest!.body),
  })
  expect(retryResponse.status()).toBe(200)
  expect((await retryResponse.json()).data.group.id).toBe(groupId)

  await page.getByRole('link', { name: 'Gruppen' }).click()
  await expect(page.getByRole('link', { name: /Wochenendtrip/ })).toHaveCount(1)
})

test('creation without a participant succeeds and offline is distinct from pending', async ({ page, context }) => {
  await page.goto('/groups/preload')
  await expect(page.getByRole('heading', { level: 1, name: 'Gruppe nicht gefunden' })).toBeVisible()
  await page.getByRole('link', { name: 'Zur Gruppenliste' }).click()
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await context.setOffline(true)
  await page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' }).uncheck()
  await page.getByLabel('Gruppenname').fill('Ohne Teilnehmer')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Ohne Teilnehmer' })).toBeFocused()
  await expect(page.getByText('Offline. Die Gruppe bleibt lokal nutzbar und wird später synchronisiert.')).toBeVisible()
  await expectNoAxeViolations(page)

  const reconnectResponse = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await context.setOffline(false)
  await reconnectResponse
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()

  await page.getByRole('link', { name: 'Gruppen' }).click()
  await expect(page.getByRole('link', { name: /Ohne Teilnehmer/ })).toHaveCount(1)
})

test('a failed request keeps the local group and retries the identical operation', async ({ page }) => {
  const requestBodies: string[] = []
  const recordRequest = (request: import('@playwright/test').Request) => {
    if (request.url().endsWith('/api/groups') && request.method() === 'POST') {
      requestBodies.push(request.postData() ?? '')
    }
  }
  page.on('request', recordRequest)
  await page.route('**/api/groups', route => route.abort('connectionrefused'))

  await page.getByLabel('Gruppenname').fill('Retry-Reise')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Wolfgang')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()

  const heading = page.getByRole('heading', { level: 1, name: 'Retry-Reise' })
  await expect(heading).toBeVisible()
  await expect(page.getByText('Der Server ist derzeit nicht erreichbar. Die Gruppe bleibt lokal nutzbar.')).toBeVisible()
  const retry = page.getByRole('button', { name: 'Synchronisierung erneut versuchen' })
  await expect(retry).toBeVisible()
  await expectNoAxeViolations(page)

  await page.unroute('**/api/groups')
  const successResponse = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await retry.click()
  await successResponse

  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  expect(requestBodies).toHaveLength(2)
  expect(requestBodies[1]).toBe(requestBodies[0])
  const groupId = new URL(page.url()).pathname.split('/').at(-1)
  expect(JSON.parse(requestBodies[1]!).groupId).toBe(groupId)
  await expectNoAxeViolations(page)
})
