/**
 * Make sure the isolated test database exists and is migrated.
 *
 * Local app data lives in `findback`. Tests wipe tables, so they must
 * never share that database — otherwise `npm test` deletes the users and
 * reports you created while clicking through the app.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const appUrl = process.env.DATABASE_URL;
const testUrl = process.env.DATABASE_URL_TEST;

if (!appUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

if (!testUrl) {
  console.error('DATABASE_URL_TEST is not set. Tests would share the app database.');
  process.exit(1);
}

const TEST_DB = 'findback_test';

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) });

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}) AS exists
    `;

    if (!rows[0]?.exists) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${TEST_DB}`);
      console.log(`Created database ${TEST_DB}.`);
    }
  } finally {
    await prisma.$disconnect();
  }

  const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  if (migrate.status !== 0) {
    process.exit(migrate.status ?? 1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
