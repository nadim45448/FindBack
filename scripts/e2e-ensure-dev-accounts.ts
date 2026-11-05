/**
 * Force known dev/E2E accounts into a sign-in-ready state on the test database.
 *
 * `dev-accounts.ts` is idempotent and skips existing rows, so integration tests
 * that deactivate accounts can leave E2E auth setup failing. This script runs
 * only from `e2e-prepare.ts` against `DATABASE_URL_TEST`.
 */

import { existsSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { E2E_WORLD } from '../e2e/fixtures/world';
import { NodeArgon2PasswordHasher } from '../src/infrastructure/accounts/node-argon2-password-hasher';

const MEMBER2_ID = 'e2e00001-0001-4001-8001-000000000001';

const PASSWORD = 'FindBack1234';

const SEED_ACCOUNTS = [
  {
    email: 'admin@findback.test',
    displayName: 'The Administrator',
    selfDeclaredRole: 'Employee',
    status: 'Active',
    isAdministrator: true,
  },
  {
    email: 'member@findback.test',
    displayName: 'A Member',
    selfDeclaredRole: 'Student',
    status: 'Active',
    isAdministrator: false,
  },
  {
    email: 'pending@findback.test',
    displayName: 'A Pending Member',
    selfDeclaredRole: 'Student',
    status: 'Pending',
    isAdministrator: false,
  },
] as const;

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

async function upsertSeedAccount(
  prisma: PrismaClient,
  passwordHash: string,
  account: (typeof SEED_ACCOUNTS)[number],
): Promise<void> {
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "accounts"
     WHERE lower(btrim("email")) = lower(btrim($1))
       AND "status" <> 'Rejected'
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    account.email,
  );

  const activatedAt = account.status === 'Active' ? new Date() : null;

  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE "accounts"
       SET "passwordHash" = $2,
           "displayName" = $3,
           "selfDeclaredRole" = $4,
           "status" = $5,
           "isAdministrator" = $6,
           "activatedAt" = $7,
           "deactivatedAt" = NULL,
           "rejectionReason" = NULL
       WHERE "id" = $1::uuid`,
      existing[0].id,
      passwordHash,
      account.displayName,
      account.selfDeclaredRole,
      account.status,
      account.isAdministrator,
      activatedAt,
    );
    console.log(`${account.email.padEnd(24)} reset to ${account.status}`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "accounts"
       ("email", "passwordHash", "displayName", "selfDeclaredRole",
        "status", "isAdministrator", "activatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    account.email,
    passwordHash,
    account.displayName,
    account.selfDeclaredRole,
    account.status,
    account.isAdministrator,
    activatedAt,
  );
  console.log(`${account.email.padEnd(24)} created as ${account.status}`);
}

async function main(): Promise<void> {
  console.log('E2E — ensuring dev accounts are sign-in ready…\n');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const hasher = new NodeArgon2PasswordHasher();
  const passwordHash = (await hasher.hash(PASSWORD)).value;

  try {
    for (const account of SEED_ACCOUNTS) {
      await upsertSeedAccount(prisma, passwordHash, account);
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts"
         ("id", "email", "passwordHash", "displayName", "selfDeclaredRole",
          "status", "isAdministrator", "activatedAt")
       VALUES ($1::uuid, $2, $3, 'E2E Member Two', 'Student', 'Active', false, NOW())
       ON CONFLICT ("id") DO UPDATE
       SET "email" = EXCLUDED."email",
           "passwordHash" = EXCLUDED."passwordHash",
           "status" = 'Active',
           "activatedAt" = COALESCE("accounts"."activatedAt", NOW()),
           "deactivatedAt" = NULL,
           "rejectionReason" = NULL`,
      MEMBER2_ID,
      E2E_WORLD.member2Email,
      passwordHash,
    );
    console.log(`${E2E_WORLD.member2Email.padEnd(24)} reset to Active`);
  } finally {
    await prisma.$disconnect();
  }

  console.log('');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
