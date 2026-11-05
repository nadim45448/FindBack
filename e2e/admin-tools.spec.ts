import { test, expect } from '@playwright/test';

import { E2E_WORLD } from './fixtures/world';

test.describe('administrator tools', () => {
  test('storage usage page loads', async ({ page }) => {
    await page.goto('/admin/storage');
    await expect(page.getByRole('heading', { name: 'Image storage', level: 1 })).toBeVisible();
  });

  test('contextual audit trail page loads for found report', async ({ page }) => {
    await page.goto(`/admin/items/${E2E_WORLD.foundOpenReportId}/audit`);
    await expect(page.getByRole('heading', { name: 'Audit trail', level: 1 })).toBeVisible();
    await expect(page.getByText('There are no events for this item yet.')).toBeVisible();
  });

  test('administrator report edit page loads', async ({ page }) => {
    await page.goto(`/admin/reports/${E2E_WORLD.foundOpenReportId}/edit`);
    await expect(page.getByRole('heading', { name: /Edit report/i, level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit report' })).toBeVisible();
  });
});
