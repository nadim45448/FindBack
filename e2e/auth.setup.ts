import { test as setup } from '@playwright/test';

import { signIn } from './helpers/auth';
import { E2E_ADMIN_EMAIL, E2E_MEMBER_EMAIL } from './helpers/credentials';

const memberAuthFile = 'e2e/.auth/member.json';
const adminAuthFile = 'e2e/.auth/admin.json';

setup('authenticate member', async ({ page }) => {
  await signIn(page, E2E_MEMBER_EMAIL);
  await page.waitForURL(/\/home(?:\?|$)/);
  await page.context().storageState({ path: memberAuthFile });
});

setup('authenticate administrator', async ({ page }) => {
  await signIn(page, E2E_ADMIN_EMAIL);
  await page.waitForURL(/\/admin(?:\?|$)/);
  await page.context().storageState({ path: adminAuthFile });
});
