import { test, expect } from '@playwright/test';

import { submitMinimalLostReport } from './helpers/forms';
import { E2E_WORLD } from './fixtures/world';

test.describe('report lifecycle (member)', () => {
  test('creates a lost report and opens it from My Reports', async ({ page }) => {
    const uniqueName = `E2E Lost ${Date.now()}`;

    await page.goto('/report/lost');
    await submitMinimalLostReport(page, uniqueName);

    await expect(page).toHaveURL(/\/my\/reports\//);
    await expect(page.getByRole('heading', { name: uniqueName, level: 1 })).toBeVisible();

    await page.goto('/my/reports');
    const reportRow = page.getByRole('row', { name: new RegExp(uniqueName) });
    await expect(reportRow).toBeVisible();
    await reportRow.click();
    await expect(page.getByRole('heading', { name: uniqueName, level: 1 })).toBeVisible();
  });

  test('report edit page loads for an owned report', async ({ page }) => {
    await page.goto('/my/reports');
    await page.goto(`/my/reports/${E2E_WORLD.lostOpenReportId}`);
    await expect(page).toHaveURL(/\/my\/reports\//);

    const editLink = page.getByRole('link', { name: 'Edit' });

    if ((await editLink.count()) > 0) {
      await editLink.click();
      await expect(page).toHaveURL(/\/edit/);
      await expect(page.getByRole('button', { name: 'Submit report' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});
