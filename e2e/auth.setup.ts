import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { test as setup } from '@playwright/test';

import { signIn } from './helpers/auth';
import { E2E_ADMIN_EMAIL, E2E_MEMBER_EMAIL } from './helpers/credentials';

const memberAuthFile = 'e2e/.auth/member.json';
const adminAuthFile = 'e2e/.auth/admin.json';

function ensureDevAccountsForE2E(): void {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }

  const testUrl = process.env.DATABASE_URL_TEST;

  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST must be set for E2E auth setup.');
  }

  const result = spawnSync('npx', ['tsx', 'scripts/e2e-ensure-dev-accounts.ts'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

setup('authenticate member', async ({ page }) => {
  ensureDevAccountsForE2E();
  await signIn(page, E2E_MEMBER_EMAIL);
  await page.waitForURL(/\/home(?:\?|$)/);
  await page.context().storageState({ path: memberAuthFile });
});

setup('authenticate administrator', async ({ page }) => {
  ensureDevAccountsForE2E();
  await signIn(page, E2E_ADMIN_EMAIL);
  await page.waitForURL(/\/admin(?:\?|$)/);
  await page.context().storageState({ path: adminAuthFile });
});
