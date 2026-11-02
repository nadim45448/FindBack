/**
 * Lost verification → match → confirm returned (database).
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildListingsStack } from './listings-stack';

import { ConflictError } from '@/lib/errors';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Lost verification return flow (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-00000000f101';
  const adminId = '00000000-0000-4000-8000-00000000f102';
  const responderId = '00000000-0000-4000-8000-00000000f103';

  let reportId = '';
  let responseId = '';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, 'owner-f101@test', 'hash', 'Owner', 'Student', 'Active', false),
              ($2, 'admin-f102@test', 'hash', 'Admin', 'Employee', 'Active', true),
              ($3, 'resp-f103@test', 'hash', 'Responder', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      ownerId,
      adminId,
      responderId,
    );

    const reports = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Verification Pending', 'House keys', 'Keys',
               'A set of house keys on a red fabric loop near the library.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    reportId = reports[0]!.id;

    const responses = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                          "campus_area", "where_found_exact_place",
                                          "observed_identifying_details",
                                          "date_found", "submitted_at", "created_at", "updated_at")
       VALUES ($1, $2, 'Selected for Verification', 'library', 'East entrance bench',
               'Red fabric loop on a key ring with three keys.', DATE '2026-10-28',
               NOW(), NOW(), NOW())
       RETURNING "id"`,
      reportId,
      responderId,
    );

    responseId = responses[0]!.id;
  });

  afterAll(async () => {
    if (reportId.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`);
        await tx.auditEvent.deleteMany({ where: { parentId: reportId } });
      });
      await prisma.$executeRawUnsafe(`DELETE FROM "return_confirmations" WHERE "report_id" = $1::uuid`, reportId);
      await prisma.$executeRawUnsafe(`DELETE FROM "recovery_responses" WHERE "report_id" = $1::uuid`, reportId);
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1::uuid`, reportId);
    }

    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3)`,
        ownerId,
        adminId,
        responderId,
      );
    } catch {
      // Teardown only — FKs from audit rows may remain in other suites' data.
    }

    await prisma.$disconnect();
  });

  it('refuses confirm returned before match is recorded', async () => {
    const stack = buildListingsStack();

    await expect(
      stack.returnConfirmations.confirm({
        reportId,
        actor: { actorId: adminId, isAdministrator: true },
        substitute: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('completes after the administrator records match confirmed', async () => {
    const stack = buildListingsStack();

    await stack.recoveryResponseDeterminations.record({
      reportId,
      responseId,
      outcome: 'match_confirmed',
      determinedByUserId: ownerId,
      actor: { actorId: adminId, isAdministrator: true },
    });

    const result = await stack.returnConfirmations.confirm({
      reportId,
      actor: { actorId: adminId, isAdministrator: true },
      substitute: null,
    });

    expect(result.status).toBe('Returned');

    const report = await prisma.report.findFirst({
      where: { id: reportId },
      select: { status: true },
    });

    expect(report?.status).toBe('Returned');
  });
});
