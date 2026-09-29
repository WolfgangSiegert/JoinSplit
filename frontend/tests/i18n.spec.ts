import { expect, test } from '@playwright/test'

test('switches between German and English and persists the local preference', async ({ page }) => {
  await page.goto('/settings')
  expect(await page.evaluate(() => navigator.languages)).toContain('de-DE')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await page.getByRole('radio', { name: 'English' }).check()

  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toContainText('Groups')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('radio', { name: 'English' })).toBeChecked()
})
