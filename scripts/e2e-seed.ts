/**
 * Deterministic listings + participation data for Playwright E2E.
 *
 * Runs against `DATABASE_URL` (set to `DATABASE_URL_TEST` by e2e-prepare).
 * Idempotent: deletes prior E2E fixture rows by id, then re-inserts.
 */

import { existsSync } from 'node:fs';

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { NodeArgon2PasswordHasher } from '../src/infrastructure/accounts/node-argon2-password-hasher';

import { E2E_WORLD } from '../e2e/fixtures/world';

const PASSWORD = 'FindBack1234';

const FIXTURE_REPORT_IDS = [
  E2E_WORLD.foundOpenReportId,
  E2E_WORLD.foundClaimRequestedReportId,
  E2E_WORLD.foundAwaitingReturnReportId,
  E2E_WORLD.lostOpenReportId,
  E2E_WORLD.lostVerificationReportId,
  E2E_WORLD.returnedReportId,
] as const;

const FIXTURE_CLAIM_IDS = [
  E2E_WORLD.pendingClaimId,
  E2E_WORLD.returnedApprovedClaimId,
] as const;

const MEMBER2_ID = 'e2e00001-0001-4001-8001-000000000001';

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

async function accountIdByEmail(prisma: PrismaClient, email: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "accounts"
     WHERE lower(btrim("email")) = lower(btrim($1))
       AND "status" <> 'Rejected'
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    email,
  );

  const id = rows[0]?.id;

  if (!id) {
    throw new Error(`Missing account for ${email}. Run dev-accounts first.`);
  }

  return id;
}

async function ensureMember2(prisma: PrismaClient, passwordHash: string): Promise<void> {
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "accounts" WHERE "id" = $1::uuid`,
    MEMBER2_ID,
  );

  if (existing[0]) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "accounts"
       ("id", "email", "passwordHash", "displayName", "selfDeclaredRole",
        "status", "isAdministrator", "activatedAt")
     VALUES ($1::uuid, $2, $3, 'E2E Member Two', 'Student', 'Active', false, NOW())`,
    MEMBER2_ID,
    E2E_WORLD.member2Email,
    passwordHash,
  );
}

async function clearFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`);

    for (const reportId of FIXTURE_REPORT_IDS) {
      await tx.auditEvent.deleteMany({ where: { parentId: reportId } });
    }

    await tx.$executeRawUnsafe(
      `DELETE FROM "return_confirmations" WHERE "report_id" = ANY($1::uuid[])`,
      FIXTURE_REPORT_IDS,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM "thread_messages" WHERE "claim_id" = ANY($1::uuid[])`,
      FIXTURE_CLAIM_IDS,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM "claims" WHERE "id" = ANY($1::uuid[])`,
      FIXTURE_CLAIM_IDS,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM "recovery_responses" WHERE "report_id" = ANY($1::uuid[])`,
      FIXTURE_REPORT_IDS,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM "claims" WHERE "report_id" = ANY($1::uuid[])`,
      FIXTURE_REPORT_IDS,
    );

    await tx.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = ANY($1::uuid[])`, FIXTURE_REPORT_IDS);
  });
}

async function insertReport(
  prisma: PrismaClient,
  params: {
    readonly id: string;
    readonly type: 'Lost' | 'Found';
    readonly status: string;
    readonly name: string;
    readonly reporterId: string;
  },
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "reports"
       ("id", "type", "status", "name", "category", "description", "date",
        "campus_area", "exact_place", "identifying_details", "reporter_id",
        "created_at", "updated_at")
     VALUES ($1::uuid, $2, $3, $4, 'Wallet', 'E2E fixture report.', DATE '2026-10-20',
             'library', 'Main library entrance', 'Blue fabric tag.', $5::uuid, NOW(), NOW())`,
    params.id,
    params.type,
    params.status,
    params.name,
    params.reporterId,
  );
}

async function main(): Promise<void> {
  console.log('E2E — seeding fixture data…\n');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const hasher = new NodeArgon2PasswordHasher();
  const passwordHash = (await hasher.hash(PASSWORD)).value;

  try {
    await ensureMember2(prisma, passwordHash);

    const memberId = await accountIdByEmail(prisma, 'member@findback.test');
    const adminId = await accountIdByEmail(prisma, 'admin@findback.test');

    await clearFixtures(prisma);

    await insertReport(prisma, {
      id: E2E_WORLD.foundOpenReportId,
      type: 'Found',
      status: 'Open',
      name: E2E_WORLD.foundOpenReportName,
      reporterId: memberId,
    });

    await insertReport(prisma, {
      id: E2E_WORLD.foundClaimRequestedReportId,
      type: 'Found',
      status: 'Claim Requested',
      name: E2E_WORLD.foundClaimRequestedReportName,
      reporterId: memberId,
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO "claims"
         ("id", "report_id", "claimant_id", "status", "reason",
          "identifying_details", "date_lost", "submitted_at", "created_at", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Pending',
               'It is my phone — same case sticker.',
               'Cracked corner, yellow sticker.', DATE '2026-10-18', NOW(), NOW(), NOW())`,
      E2E_WORLD.pendingClaimId,
      E2E_WORLD.foundClaimRequestedReportId,
      MEMBER2_ID,
    );

    await insertReport(prisma, {
      id: E2E_WORLD.foundAwaitingReturnReportId,
      type: 'Found',
      status: 'Claim Approved',
      name: E2E_WORLD.foundAwaitingReturnReportName,
      reporterId: memberId,
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO "claims"
         ("id", "report_id", "claimant_id", "status", "reason",
          "identifying_details", "date_lost", "submitted_at",
          "decided_by_administrator_id", "decided_at", "created_at", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Approved',
               'Mine — distinctive strap.',
               'Red strap, metal buckle.', DATE '2026-10-17', NOW(),
               $4::uuid, NOW(), NOW(), NOW())`,
      'e2e0000b-000b-400b-800b-00000000000b',
      E2E_WORLD.foundAwaitingReturnReportId,
      MEMBER2_ID,
      adminId,
    );

    await insertReport(prisma, {
      id: E2E_WORLD.lostOpenReportId,
      type: 'Lost',
      status: 'Open',
      name: E2E_WORLD.lostOpenReportName,
      reporterId: memberId,
    });

    await insertReport(prisma, {
      id: E2E_WORLD.lostVerificationReportId,
      type: 'Lost',
      status: 'Verification Pending',
      name: E2E_WORLD.lostVerificationReportName,
      reporterId: memberId,
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO "recovery_responses"
         ("id", "report_id", "responder_id", "status", "campus_area",
          "where_found_exact_place", "observed_identifying_details",
          "date_found", "submitted_at", "created_at", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Selected for Verification', 'library',
               'East entrance bench', 'Red fabric loop, three keys.', DATE '2026-10-19',
               NOW(), NOW(), NOW())`,
      E2E_WORLD.recoverySelectedResponseId,
      E2E_WORLD.lostVerificationReportId,
      MEMBER2_ID,
    );

    await insertReport(prisma, {
      id: E2E_WORLD.returnedReportId,
      type: 'Found',
      status: 'Returned',
      name: E2E_WORLD.returnedReportName,
      reporterId: memberId,
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO "claims"
         ("id", "report_id", "claimant_id", "status", "reason",
          "identifying_details", "date_lost", "submitted_at",
          "decided_by_administrator_id", "decided_at", "created_at", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Returned',
               'Returned to me at the desk.',
               'Wooden handle.', DATE '2026-10-15', NOW(),
               $4::uuid, NOW(), NOW(), NOW())`,
      E2E_WORLD.returnedApprovedClaimId,
      E2E_WORLD.returnedReportId,
      MEMBER2_ID,
      adminId,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO "return_confirmations"
         ("report_id", "report_type", "default_receiver_account_id",
          "administrator_id", "confirmed_at", "created_at")
       VALUES ($1::uuid, 'Found', $2::uuid, $3::uuid, NOW(), NOW())`,
      E2E_WORLD.returnedReportId,
      MEMBER2_ID,
      adminId,
    );

    console.log('E2E fixtures seeded (reports, claims, recovery, return).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
