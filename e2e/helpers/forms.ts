import type { Page } from '@playwright/test';

/** Fill a minimal valid lost report (required fields only). */
export async function submitMinimalLostReport(page: Page, itemName: string): Promise<void> {
  await page.getByLabel('Item name').fill(itemName);
  await page.getByLabel('Category').selectOption('Wallet');
  await page.getByLabel('Description').fill('E2E automation — lost item description.');
  const date = page.locator('#date');
  const max = await date.getAttribute('max');

  if (max) {
    await date.fill(max);
  }

  await page.getByLabel('Location (campus area)').selectOption('library');
  await page.getByRole('button', { name: 'Submit report' }).click();
}

/** Fill a minimal claim against the current claim form. */
export async function submitMinimalClaim(page: Page): Promise<void> {
  await page.getByLabel('Reason').fill('This item matches what I lost last week.');
  await page.getByLabel('Identifying details').fill('Small scratch on the back corner.');
  const dateLost = page.locator('#dateLost');
  const max = await dateLost.getAttribute('max');

  if (max) {
    await dateLost.fill(max);
  }

  await page.getByRole('button', { name: 'Submit claim' }).click();
}
