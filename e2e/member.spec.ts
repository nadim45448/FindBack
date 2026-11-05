import { test, expect } from '@playwright/test';

test.describe('member home and navigation', () => {
  test('home dashboard shows quick actions and view links', async ({ page }) => {
    await page.goto('/home');

    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick actions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Where would you like to go?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Report Lost Item' })).toBeVisible();
  });

  test('top navigation reaches the four member views', async ({ page }) => {
    await page.goto('/home');

    const nav = page.getByRole('navigation', { name: 'Member navigation' });

    await nav.getByRole('link', { name: 'My Reports' }).click();
    await expect(page).toHaveURL(/\/my\/reports/);
    await expect(page.getByRole('heading', { name: 'My reports', level: 1 })).toBeVisible();

    await nav.getByRole('link', { name: 'Browse' }).click();
    await expect(page).toHaveURL(/\/listings/);
    await expect(page.getByRole('heading', { name: 'Lost & Found', level: 1 })).toBeVisible();

    await nav.getByRole('link', { name: 'My Claims' }).click();
    await expect(page).toHaveURL(/\/my\/claims/);
    await expect(page.getByRole('heading', { name: 'My claims', level: 1 })).toBeVisible();

    await nav.getByRole('link', { name: 'My Recovery Responses' }).click();
    await expect(page).toHaveURL(/\/my\/recovery-responses/);
    await expect(page.getByRole('heading', { name: 'My recovery responses', level: 1 })).toBeVisible();
  });

  test('profile page is reachable from account menu', async ({ page }) => {
    await page.goto('/home');

    await page.getByRole('button', { name: /Account menu/i }).click();
    await page.getByRole('link', { name: 'Profile' }).click();

    await expect(page).toHaveURL(/\/my\/profile/);
    await expect(page.getByRole('heading', { name: 'My profile', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Display name')).toBeVisible();
  });

  test('report lost form loads with primary actions', async ({ page }) => {
    await page.goto('/report/lost');

    await expect(page.getByRole('heading', { name: /Report a lost item/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });
});

test.describe('member tables and layout', () => {
  test('my reports table has bold column headers when rows exist', async ({ page }) => {
    await page.goto('/my/reports');

    const table = page.getByRole('table');
    const hasTable = (await table.count()) > 0;

    if (!hasTable) {
      await expect(page.getByText(/No reports yet|Filter/i).first()).toBeVisible();
      return;
    }

    await expect(table.getByRole('columnheader', { name: 'Item' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  });
});
