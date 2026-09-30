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

test('keeps every language option inside the settings card on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('/settings')

  const languageCard = page.locator('section[aria-labelledby="language-settings"]')
  const cardBox = await languageCard.boundingBox()
  expect(cardBox).not.toBeNull()

  for (const label of ['Systemsprache', 'Deutsch', 'English']) {
    const optionBox = await page.getByRole('radio', { name: label }).locator('..').boundingBox()
    expect(optionBox).not.toBeNull()
    expect(optionBox!.x).toBeGreaterThanOrEqual(cardBox!.x)
    expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width)
  }

  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
