/**
 * Prepare the isolated E2E database before Playwright runs.
 *
 * Uses `DATABASE_URL_TEST` (same as unit tests) so E2E does not wipe or
 * depend on day-to-day data in `findback`.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const testUrl = process.env.DATABASE_URL_TEST;

if (!testUrl) {
  console.error('DATABASE_URL_TEST is not set. Copy .env.example to .env.local.');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: testUrl };

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: false });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('E2E — preparing test database…\n');

run('npx', ['tsx', 'scripts/ensure-test-database.ts']);
run('npx', ['tsx', 'prisma/seed.ts']);
run('npx', ['tsx', 'scripts/dev-accounts.ts']);

console.log('\nE2E — database ready.\n');
