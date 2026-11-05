import { test, expect } from '@playwright/test';

test.describe('administrator console', () => {
  test('dashboard shows operations console and queue tiles', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Administrator', level: 1 })).toBeVisible();
    await expect(page.getByText('Operations console')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review workload' })).toBeVisible();
  });

  test('admin navigation opens each operational queue', async ({ page }) => {
    await page.goto('/admin');

    const adminNav = page.getByRole('navigation', { name: 'Admin' });

    await adminNav.getByRole('link', { name: 'Registrations' }).click();
    await expect(page).toHaveURL(/\/admin\/registrations/);
    await expect(page.getByRole('heading', { name: 'Pending Registrations', level: 1 })).toBeVisible();

    await adminNav.getByRole('link', { name: 'Claims' }).click();
    await expect(page).toHaveURL(/\/admin\/claims/);
    await expect(page.getByRole('heading', { name: 'Pending Claims', level: 1 })).toBeVisible();

    await adminNav.getByRole('link', { name: 'Awaiting return' }).click();
    await expect(page).toHaveURL(/\/admin\/awaiting-return/);
    await expect(page.getByRole('heading', { name: 'Items Awaiting Return', level: 1 })).toBeVisible();

    await adminNav.getByRole('link', { name: 'In verification' }).click();
    await expect(page).toHaveURL(/\/admin\/verifications/);
    await expect(page.getByRole('heading', { name: 'Items in Verification', level: 1 })).toBeVisible();
  });

  test('returned items queue loads', async ({ page }) => {
    await page.goto('/admin/returned');

    await expect(page.getByRole('heading', { name: 'Returned items', level: 1 })).toBeVisible();
    await expect(
      page.getByText('Physical handoffs recorded on the system', { exact: false }),
    ).toBeVisible();
  });

  test('registrations queue shows cards or empty state', async ({ page }) => {
    await page.goto('/admin/registrations');

    await expect(page.getByRole('heading', { name: 'Pending Registrations', level: 1 })).toBeVisible();

    const reviewCard = page.locator('.registration-queue__card').first();
    const emptyCopy = page.getByText('No pending registrations.');

    await expect(reviewCard.or(emptyCopy)).toBeVisible();
  });
});
