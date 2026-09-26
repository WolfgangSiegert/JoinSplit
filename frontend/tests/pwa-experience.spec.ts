import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function exposeInstallPrompt(page: Page, outcome: 'accepted' | 'dismissed' = 'dismissed') {
  await page.evaluate((choice) => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperties(event, {
      prompt: {
        value: () => {
          document.documentElement.dataset.installPromptCalls = String(
            Number(document.documentElement.dataset.installPromptCalls ?? '0') + 1,
          )
        },
      },
      userChoice: { value: Promise.resolve({ outcome: choice, platform: 'web' }) },
    })
    window.dispatchEvent(event)
  }, outcome)
}

test('offers installation only after the browser exposes a native prompt', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'JoinSplit als App installieren' })).toHaveCount(0)

  await exposeInstallPrompt(page)

  await expect(page.getByRole('heading', { name: 'JoinSplit als App installieren' })).toBeVisible()
  await page.getByRole('button', { name: 'Installieren', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.installPromptCalls)).toBe('1')
  await expect(page.getByRole('status')).toContainText('Installation wurde nicht durchgeführt.')
})

test('keeps the install notice dismissed after an explicit not-now choice', async ({ page }) => {
  await page.goto('/')
  await exposeInstallPrompt(page)

  const notice = page.getByRole('heading', { name: 'JoinSplit als App installieren' })
  await expect(notice).toBeVisible()
  await page.getByRole('button', { name: 'Nicht jetzt' }).click()
  await expect(notice).toHaveCount(0)

  await exposeInstallPrompt(page)
  await expect(notice).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vite-pwa:hide-install'))).toBe('true')
})

test('keeps unsupported installation as guidance without a false action', async ({ page }) => {
  await page.goto('/settings')

  const installation = page.getByRole('region', { name: 'App-Installation' })
  await expect(installation).toContainText('Eine direkte Installation ist hier gerade nicht verfügbar.')
  await expect(installation.getByRole('button', { name: 'JoinSplit installieren' })).toHaveCount(0)
})

test('install affordance reflows at 320 px and has no automated accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await exposeInstallPrompt(page, 'accepted')

  await expect(page.getByRole('heading', { name: 'JoinSplit als App installieren' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])
})
