import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const e2ePort = process.env.PLAYWRIGHT_PORT ?? '3001';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${e2ePort}`;
const e2eDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

if (!e2eDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST (or DATABASE_URL) must be set for E2E.');
}

const memberAuthFile = 'e2e/.auth/member.json';
const adminAuthFile = 'e2e/.auth/admin.json';

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/helpers/**'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, fullyParallel: false },
    {
      name: 'anonymous',
      testMatch: /anonymous\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'auth-flows',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'member',
      testMatch: [/member\.spec\.ts/, /member-.*\.spec\.ts/],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: memberAuthFile },
    },
    {
      name: 'admin',
      testMatch: [/admin\.spec\.ts/, /admin-.*\.spec\.ts/],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: adminAuthFile },
    },
  ],
  webServer: {
    command: 'bash scripts/e2e-web-server.sh',
    url: baseURL,
    reuseExistingServer: Boolean(process.env.PLAYWRIGHT_REUSE_SERVER),
    timeout: 180_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
      PORT: e2ePort,
      E2E_MANAGE_SERVER: process.env.PLAYWRIGHT_REUSE_SERVER ? '0' : '1',
    },
  },
});
