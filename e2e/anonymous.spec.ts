import { test, expect } from '@playwright/test';

test.describe('public surfaces', () => {
  test('listings page shows summary heading and sign-in path', async ({ page }) => {
    await page.goto('/listings');

    await expect(page.getByRole('heading', { name: 'Lost & Found', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign in to FindBack' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('heading', { name: /Create your FindBack account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('forgot-password page loads', async ({ page }) => {
    await page.goto('/forgot');

    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  });
});
