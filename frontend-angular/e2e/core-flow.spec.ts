import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

test('local core flow supports lifecycle, editing and accessible mobile views', async ({
  page,
}) => {
  await page.goto('/');
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Neue Gruppe starten' }).click();
  await page.getByLabel('Gruppenname').fill('Reise');
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice');
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Reise' })).toBeVisible();

  await page.getByRole('link', { name: 'Teilnehmer verwalten' }).click();
  await page.getByLabel('Name').fill('Bob');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await expect(page.getByText('Bob', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Übersicht' }).click();
  await page.getByRole('link', { name: 'Ausgabe erfassen' }).click();
  await page.getByLabel('Beschreibung').fill('Abendessen');
  await page.getByLabel('Betrag in Euro').fill('10,00');
  await page.getByLabel('Bezahlt von').selectOption({ label: 'Alice' });
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click();
  await expect(page.getByText('10,00 €')).toBeVisible();

  await page.getByRole('link', { name: 'Bearbeiten' }).click();
  await page.getByLabel('Betrag in Euro').fill('12,00');
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click();
  await expect(page.getByText('12,00 €')).toBeVisible();

  await page.getByRole('link', { name: 'Salden & Ausgleich' }).click();
  await expect(page.getByText('+6,00 €')).toBeVisible();
  await expect(page.getByText('−6,00 €')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Erfolgte Zahlung erfassen' }).click();
  await page.getByLabel('Gezahlt von').selectOption({ label: 'Bob' });
  await page.getByLabel('Gezahlt an').selectOption({ label: 'Alice' });
  await page.getByLabel('Betrag in Euro').fill('6,00');
  await page.getByRole('button', { name: 'Zahlung speichern' }).click();
  await expect(page.getByText('✓ Alles ausgeglichen.')).toBeVisible();

  await page.getByRole('link', { name: 'Übersicht' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Gruppe archivieren' }).click();
  await expect(page.getByText('Diese Gruppe ist archiviert und schreibgeschützt.')).toBeVisible();
  await page.getByRole('link', { name: 'JoinSplit Startseite' }).click();
  await expect(page.getByRole('heading', { name: 'Archivierte Gruppen' })).toBeVisible();
  await page.getByRole('link', { name: /Reise/ }).click();
  await page.getByRole('button', { name: 'Gruppe reaktivieren' }).click();
  await expect(page.getByRole('link', { name: 'Ausgabe erfassen' })).toBeVisible();
});
