import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('starts and passes the accessibility smoke check', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('JoinSplit')
  await expect(page.getByRole('heading', { level: 1, name: 'JoinSplit' })).toBeVisible()
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt')
    return root !== null && Boolean(Reflect.get(root, '__vue_app__'))
  })

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
  expect(errors).toEqual([])
})
