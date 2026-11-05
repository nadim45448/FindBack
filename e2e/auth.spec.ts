import { test, expect } from '@playwright/test';

import { signIn } from './helpers/auth';
import { E2E_ADMIN_EMAIL, E2E_MEMBER_EMAIL, E2E_PENDING_EMAIL } from './helpers/credentials';

test.describe('authentication', () => {
  test('rejects invalid credentials with a clear message', async ({ page }) => {
    await signIn(page, 'nobody@findback.test', 'WrongPassword1');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('.error-summary')).toContainText('Invalid email or password');
  });

  test('active member lands on home', async ({ page }) => {
    await signIn(page, E2E_MEMBER_EMAIL);

    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText("Here's what's happening with your reports and claims.")).toBeVisible();
  });

  test('active administrator lands on dashboard', async ({ page }) => {
    await signIn(page, E2E_ADMIN_EMAIL);

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Administrator', level: 1 })).toBeVisible();
  });

  test('pending member sees pending banner', async ({ page }) => {
    await signIn(page, E2E_PENDING_EMAIL);

    await expect(page).toHaveURL(/\/pending/);
    await expect(page.getByText('Your account is pending administrator approval.')).toBeVisible();
  });

  test('member cannot open administrator console', async ({ page }) => {
    await signIn(page, E2E_MEMBER_EMAIL);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Not available to you' })).toBeVisible();
    await expect(page.getByText('This area is for administrators only.')).toBeVisible();
  });

  test('administrator can sign out from account menu', async ({ page }) => {
    await signIn(page, E2E_ADMIN_EMAIL);

    await page.getByRole('button', { name: /Account menu/i }).click();
    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/(login|listings|$)/);
  });
});

test.describe('session gate', () => {
  test('anonymous visitor is prompted to sign in for listing detail', async ({ page }) => {
    await page.goto('/listings');

    const firstCard = page.locator('.item-card').first();

    if ((await firstCard.count()) === 0) {
      test.skip(true, 'No listing rows in E2E database — seed reports or run against populated DB.');
    }

    await expect(firstCard.getByText('Sign in to see item details.')).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(/\/login\?return=/);
  });
});
