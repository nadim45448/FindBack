import { test, expect } from '@playwright/test';

import { signIn } from './helpers/auth';
import { E2E_MEMBER2_EMAIL } from './helpers/credentials';
import { E2E_WORLD } from './fixtures/world';

const THREAD_SECTION_ID = 'participation-thread';

test.describe('claims and recovery (member2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, E2E_MEMBER2_EMAIL);
    await expect(page).toHaveURL(/\/home(?:\?|$)/);
  });

  test('opens pending claim and thread section', async ({ page }) => {
    await page.goto(`/my/claims/${E2E_WORLD.pendingClaimId}`);
    await expect(page.getByRole('heading', { name: /E2E Found Phone/i })).toBeVisible();
    await expect(page.locator(`#${THREAD_SECTION_ID}`)).toBeVisible();
  });

  test('claim form loads for open found item', async ({ page }) => {
    await page.goto(`/listings/${E2E_WORLD.foundOpenReportId}/claim`);
    await expect(page.getByRole('heading', { name: 'Submit a claim', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit claim' })).toBeVisible();
  });

  test('recovery response form loads for open lost item', async ({ page }) => {
    await page.goto(`/listings/${E2E_WORLD.lostOpenReportId}/submit-recovery-response`);
    await expect(page.getByRole('heading', { name: 'I may have found this item', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit recovery response' })).toBeVisible();
  });

  test('recovery response detail is reachable', async ({ page }) => {
    await page.goto(`/my/recovery-responses/${E2E_WORLD.recoverySelectedResponseId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
