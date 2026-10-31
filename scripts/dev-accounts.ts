/**
 * A local-development account bootstrap.
 *
 * ## Why this script exists
 *
 * **There is no way to create an administrator through the product.** A new
 * account is always `Pending` and always `isAdministrator = false` — that is
 * a domain invariant (`account.ts`, invariant 1), not a policy the UI
 * enforces. The registration queue approves members; it does not promote
 * them.
 *
 * So the **first** administrator has to be created outside the application.
 * This script does that, so a fresh checkout is usable in one command rather
 * than a hand-written `UPDATE`.
 *
 * ## What it creates
 *
 * - **`admin@findback.test`** — an `Active` administrator.
 * - **`member@findback.test`** — an `Active` member.
 * - **`pending@findback.test`** — a `Pending` member, so the FR-2
 *   restriction and the administrator's registration queue can both be
 *   exercised.
 *
 * ## The password
 *
 * The same for all three: **`FindBack1234`**. It satisfies the policy — eight
 * characters, a letter, a number. **This is a local-development credential
 * and must never appear in a deployment.**
 *
 * ## Why the hash is produced by the application's own hasher
 *
 * **The script does not invent a hash format.** It calls the same
 * `NodeArgon2PasswordHasher` the application's registration path uses, so the
 * credentials it writes are credentials the real login path can verify. A
 * hand-rolled hash would be a second answer to "what does a stored password
 * look like", and the two would disagree.
 *
 * ## It is idempotent, and it does not wipe local data
 *
 * If a seed account already exists, this script **leaves it alone** — same
 * password, same status. Re-running `npm run dev` therefore cannot delete
 * other users, reports, or listings, and cannot reset an account you have
 * already been using. Only a missing seed account is created.
 *
 * Run with `npm run dev:accounts`. `npm run dev` and `npm run db:seed`
 * also run it, so a local checkout always has an administrator to sign in
 * as. The script refuses to write these accounts when `NODE_ENV` is
 * `production`.
 */

import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { NodeArgon2PasswordHasher } from '../src/infrastructure/accounts/node-argon2-password-hasher';

/** The password every seeded account gets. */
const PASSWORD = 'FindBack1234';

/** The three accounts, and the state each one is left in. */
const ACCOUNTS = [
  {
    email: 'admin@findback.test',
    displayName: 'The Administrator',
    // **The self-declared role is one of the PRD's four**, and it is a
    // *self-declared* role — it says nothing about the authority the
    // account actually holds. The authority is `isAdministrator`.
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

if (process.env.NODE_ENV === 'production') {
  console.log('Skipping local development accounts while NODE_ENV=production.');
  process.exit(0);
}

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

async function main(): Promise<void> {
  console.log('FindBack — local development accounts\n');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const hasher = new NodeArgon2PasswordHasher();

  try {
    // **One hash for all three.** The work factors are the deployment's, and
    // the hash is verified by the same hasher the login path uses. The
    // hasher returns the domain's `PasswordHash` value object, so the
    // encoded string is taken from it.
    const passwordHash = (await hasher.hash(PASSWORD)).value;

    for (const account of ACCOUNTS) {
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string; status: string }>>(
        `SELECT "id", "status" FROM "accounts"
         WHERE lower(btrim("email")) = lower(btrim($1))
           AND "status" <> 'Rejected'
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        account.email,
      );

      if (existing[0]) {
        console.log(
          `${account.email.padEnd(24)} ${existing[0].status.padEnd(8)} already present  (${existing[0].id})`,
        );
        continue;
      }

      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "accounts"
           ("email", "passwordHash", "displayName", "selfDeclaredRole",
            "status", "isAdministrator", "activatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING "id"`,
        account.email,
        passwordHash,
        account.displayName,
        account.selfDeclaredRole,
        account.status,
        account.isAdministrator,
        account.status === 'Active' ? new Date() : null,
      );

      console.log(
        `${account.email.padEnd(24)} ${account.status.padEnd(8)} ${
          account.isAdministrator ? 'administrator' : 'member'
        }  (${rows[0]?.id})`,
      );
    }

    console.log(`\nAll three use the password: ${PASSWORD}`);
    console.log('\nSign in at /login with any of them.');
    console.log('The administrator sees /admin; the member does not.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
