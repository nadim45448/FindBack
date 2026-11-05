import { test, expect } from '@playwright/test';

import { E2E_WORLD } from './fixtures/world';

test.describe('lost report owner flows', () => {
  test('owner report hub shows lost item summary', async ({ page }) => {
    await page.goto(`/my/reports/${E2E_WORLD.lostOpenReportId}`);
    await expect(page.getByRole('heading', { name: E2E_WORLD.lostOpenReportName, level: 1 })).toBeVisible();
  });

  test('review responses page loads for lost report in verification', async ({ page }) => {
    await page.goto(`/my/reports/${E2E_WORLD.lostVerificationReportId}/review-responses`);
    await expect(
      page.getByRole('heading', {
        name: `Review responses — ${E2E_WORLD.lostVerificationReportName}`,
        level: 1,
      }),
    ).toBeVisible();
  });

  test('owner claim inbox on found report with pending claim', async ({ page }) => {
    await page.goto(`/my/reports/${E2E_WORLD.foundClaimRequestedReportId}`);
    await expect(page.getByRole('heading', { name: E2E_WORLD.foundClaimRequestedReportName, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Claims on this item/i })).toBeVisible();
  });
});
