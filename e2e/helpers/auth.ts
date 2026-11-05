import { expect, type Page } from '@playwright/test';

import { E2E_PASSWORD } from './credentials';

/** Sign in through `/login` and wait for navigation to finish. */
export async function signIn(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function signInAsMember(page: Page): Promise<void> {
  const { E2E_MEMBER_EMAIL } = await import('./credentials');
  await signIn(page, E2E_MEMBER_EMAIL);
  await expect(page).toHaveURL(/\/home(?:\?|$)/);
}

export async function signInAsAdmin(page: Page): Promise<void> {
  const { E2E_ADMIN_EMAIL } = await import('./credentials');
  await signIn(page, E2E_ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
}
