import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('global header exposes the primary workspace transitions', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Gruppen', exact: true })).toHaveAttribute('href', '/groups')
  await expect(page.getByRole('link', { name: 'Personen', exact: true })).toHaveAttribute('href', '/people')
  await expect(page.getByRole('link', { name: 'Anmelden oder registrieren', exact: true })).toHaveAttribute('href', '/account')
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Neue Gruppe' })).toHaveAttribute('href', '/groups/new')
  await expect(page.getByRole('menuitem', { name: 'Neue Person' })).toHaveAttribute('href', '/people#person-form')
})

test('mobile navigation remains operable at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Mobile Hauptnavigation' })
  for (const name of ['Start', 'Gruppen', 'Neu', 'Personen', 'Konto']) {
    const role = name === 'Neu' ? 'button' : 'link'
    const box = await navigation.getByRole(role, { name, exact: true }).boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await navigation.getByRole('link', { name: 'Gruppen' }).click()
  await expect(page).toHaveURL(/\/groups$/)
  await expect(page.getByRole('heading', { name: 'Meine Gruppen' })).toBeVisible()

  await navigation.getByRole('button', { name: 'Neu' }).click()
  const dialog = page.getByRole('dialog', { name: 'Was möchtest du anlegen?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: /^Gruppe / })).toHaveAttribute('href', '/groups/new')
  await expect(dialog.getByRole('link', { name: /^Person / })).toHaveAttribute('href', '/people#person-form')

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])
})

test('people are validated, explicitly duplicated and persisted locally', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Personen', exact: true }).click()
  const name = page.getByLabel('Name')

  await name.fill('  Ada   Lovelace  ')
  await page.getByRole('button', { name: 'Person anlegen' }).click()
  await expect(page.getByText('Ada Lovelace', { exact: true })).toBeVisible()

  await name.fill('ada lovelace')
  await page.getByRole('button', { name: 'Person anlegen' }).click()
  await expect(page.getByRole('alert')).toContainText('existiert bereits')
  await page.getByRole('checkbox', { name: /Trotzdem eine eigenständige Person/ }).check()
  await page.getByRole('button', { name: 'Person anlegen' }).click()
  await expect(page.getByText(/Ada Lovelace|ada lovelace/, { exact: true })).toHaveCount(2)

  const persistedPeople = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 10)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const getAll = db.transaction('people').objectStore('people').getAll()
    return await new Promise<Array<{ id: string }>>((resolve, reject) => {
      getAll.onsuccess = () => resolve(getAll.result)
      getAll.onerror = () => reject(getAll.error)
    })
  })
  expect(new Set(persistedPeople.map(person => person.id)).size).toBe(2)

  await page.reload()
  await expect(page.getByText(/Ada Lovelace|ada lovelace/, { exact: true })).toHaveCount(2)
})

test('person lifecycle can deactivate and reactivate without losing the record', async ({ page }) => {
  await page.goto('/')
  await page.goto('/people')
  await page.getByLabel('Name').fill('Grace Hopper')
  await page.getByRole('button', { name: 'Person anlegen' }).click()
  await page.getByRole('button', { name: 'Grace Hopper deaktivieren' }).click()
  await expect(page.getByText('Noch keine Person angelegt.')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Deaktivierte Personen anzeigen' }).check()
  await expect(page.getByText('Grace Hopper', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reaktivieren' }).click()
  await expect(page.getByText('Grace Hopper', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Grace Hopper deaktivieren' })).toBeVisible()
})

test('hard deletion names the Person and requires explicit confirmation', async ({ page }) => {
  await page.goto('/people')
  await page.getByLabel('Name').fill('Katherine Johnson')
  await page.getByRole('button', { name: 'Person anlegen' }).click()
  await page.getByRole('button', { name: 'Katherine Johnson deaktivieren' }).click()
  await page.getByRole('checkbox', { name: 'Deaktivierte Personen anzeigen' }).check()

  await page.getByRole('button', { name: 'Katherine Johnson löschen' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Person endgültig löschen' })
  await expect(dialog).toContainText('Katherine Johnson')
  await dialog.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(page.getByText('Katherine Johnson', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Katherine Johnson löschen' }).click()
  await dialog.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page.getByText('Katherine Johnson', { exact: true })).toHaveCount(0)
})
