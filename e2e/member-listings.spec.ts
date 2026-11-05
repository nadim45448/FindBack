import { test, expect } from '@playwright/test';

import { signIn } from './helpers/auth';
import { E2E_MEMBER2_EMAIL } from './helpers/credentials';
import { E2E_WORLD } from './fixtures/world';

test.describe('listings and item detail (member2 browse)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, E2E_MEMBER2_EMAIL);
    await expect(page).toHaveURL(/\/home(?:\?|$)/);
  });

  test('browse lists seeded found item from another member', async ({ page }) => {
    await page.goto('/listings');
    await expect(page.getByRole('link', { name: new RegExp(E2E_WORLD.foundOpenReportName) })).toBeVisible();
  });

  test('found item detail shows status and claim entry when eligible', async ({ page }) => {
    await page.goto(`/listings/${E2E_WORLD.foundOpenReportId}`);
    await expect(page.getByRole('heading', { name: E2E_WORLD.foundOpenReportName, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submit a claim' })).toBeVisible();
  });

  test('lost item detail offers recovery response CTA', async ({ page }) => {
    await page.goto(`/listings/${E2E_WORLD.lostOpenReportId}`);
    await expect(page.getByRole('heading', { name: E2E_WORLD.lostOpenReportName, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'I may have found this item' })).toBeVisible();
  });
});

test.describe('reporter views (primary member session)', () => {
  test('reporter hub does not offer submit-claim on own found report', async ({ page }) => {
    await page.goto(`/my/reports/${E2E_WORLD.foundOpenReportId}`);
    await expect(page.getByRole('heading', { name: E2E_WORLD.foundOpenReportName, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Submit a claim' })).toHaveCount(0);
  });
});
