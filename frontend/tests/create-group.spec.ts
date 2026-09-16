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

test('successful creation navigates immediately to the empty locally pending group', async ({ page }) => {
  await page.getByLabel('Gruppenname').fill('  Wochenendtrip  ')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('  Wolfgang  ')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).dblclick()

  const heading = page.getByRole('heading', { level: 1, name: 'Wochenendtrip' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+\?created=1$/)
  await expect(page.getByText('Gruppe lokal erstellt.')).toBeVisible()
  await expect(page.getByText('Synchronisierung ausstehend. Die Gruppe ist lokal nutzbar.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Ausgaben' })).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('link', { name: 'Gruppen' }).click()
  await expect(page.getByRole('link', { name: /Wochenendtrip/ })).toHaveCount(1)
})

test('creation without a participant succeeds and offline is distinct from pending', async ({ page, context }) => {
  await page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' }).uncheck()
  await page.getByLabel('Gruppenname').fill('Ohne Teilnehmer')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Ohne Teilnehmer' })).toBeFocused()
  await expect(page.getByText('Synchronisierung ausstehend. Die Gruppe ist lokal nutzbar.')).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByText('Offline. Lokale Änderungen bleiben in dieser Sitzung nutzbar.')).toBeVisible()
})
