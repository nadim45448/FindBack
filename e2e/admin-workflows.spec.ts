import { test, expect } from '@playwright/test';

import { E2E_WORLD } from './fixtures/world';

test.describe('administrator review surfaces', () => {
  test('pending claim review page loads', async ({ page }) => {
    await page.goto(`/admin/claims/${E2E_WORLD.pendingClaimId}`);
    await expect(page.getByRole('heading', { name: 'Review claim', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reject this claim' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Approve this claim' })).toBeVisible();
  });

  test('lost verification review page loads', async ({ page }) => {
    await page.goto(`/admin/lost/${E2E_WORLD.lostVerificationReportId}`);
    await expect(page.getByRole('heading', { name: 'Verification review', level: 1 })).toBeVisible();
  });

  test('confirm returned page loads for awaiting-return item', async ({ page }) => {
    await page.goto(`/admin/awaiting-return/${E2E_WORLD.foundAwaitingReturnReportId}`);
    await expect(page.getByRole('heading', { name: 'Confirm returned', level: 1 })).toBeVisible();
  });

  test('returned item case file loads', async ({ page }) => {
    await page.goto(`/admin/items/${E2E_WORLD.returnedReportId}`);
    await expect(page.getByRole('heading', { name: E2E_WORLD.returnedReportName, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Claims on this item' })).toBeVisible();
  });

  test('lost track page loads for returned lost-side path', async ({ page }) => {
    await page.goto(`/admin/lost/${E2E_WORLD.lostVerificationReportId}/track`);
    await expect(page.getByRole('heading', { name: E2E_WORLD.lostVerificationReportName, level: 1 })).toBeVisible();
  });
});

test.describe('registration review', () => {
  test('registration approve surface loads for pending account', async ({ page }) => {
    await page.goto('/admin/registrations');
    const approveLink = page.getByRole('link', { name: 'Approve' }).first();

    if ((await approveLink.count()) === 0) {
      test.skip(true, 'No pending registrations in queue.');
    }

    await approveLink.click();
    await expect(page).toHaveURL(/\/admin\/registrations\/.+/);
    await expect(page.getByRole('heading', { name: 'Approve registration', level: 1 })).toBeVisible();
  });
});
