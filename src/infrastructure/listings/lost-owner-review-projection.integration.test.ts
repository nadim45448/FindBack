/**
 * Lost-report owners must see recovery responses on the review screen.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createActorContext } from '@/domain/accounts/actor-context';
import { ReportVisibilityService } from '@/application/listings/report-visibility-service';
import { readReviewResponses } from '@/app/my/reports/_review-responses-reading';

import { PrismaAuditTrailVisibilityReader } from './prisma-audit-trail-visibility-reader';
import { PrismaClaimVisibilityReader } from './prisma-claim-visibility-reader';
import { PrismaRecoveryResponseVisibilityReader } from './prisma-recovery-response-visibility-reader';
import { PrismaReportVisibilityReader } from './prisma-report-visibility-reader';
import { PrismaThreadVisibilityReader } from './prisma-thread-visibility-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('lost owner review (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000811';
  const responderId = '00000000-0000-4000-8000-000000000812';

  let reportId = '';
  let responseId = '';

  const visibility = new ReportVisibilityService({
    reports: new PrismaReportVisibilityReader(prisma),
    claims: new PrismaClaimVisibilityReader(prisma),
    responses: new PrismaRecoveryResponseVisibilityReader(prisma),
    threads: new PrismaThreadVisibilityReader(prisma),
    trail: new PrismaAuditTrailVisibilityReader(prisma),
  });

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'Lost owner', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'Responder', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      ownerId,
      'lost-owner-review@example.test',
      responderId,
      'responder-review@example.test',
    );

    const reportRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'Lost mouse', 'Electronics',
               'A wireless mouse with a USB receiver.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    reportId = reportRows[0]!.id;

    const responseRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                          "submitted_at", "campus_area",
                                          "where_found_exact_place",
                                          "observed_identifying_details",
                                          "date_found", "created_at", "updated_at")
       VALUES ($1, $2, 'Submitted', NOW(), 'library',
               'Near the east entrance', 'Black mouse with red LED.', DATE '2026-10-27',
               NOW(), NOW())
       RETURNING "id"`,
      reportId,
      responderId,
    );

    responseId = responseRows[0]!.id;
  });

  afterAll(async () => {
    if (reportId.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "recovery_responses" WHERE "report_id" = $1`,
        reportId,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2)`,
      ownerId,
      responderId,
    );
    await prisma.$disconnect();
  });

  it('includes submitted responses in the owner projection', async () => {
    const actor = createActorContext({
      actorId: ownerId,
      status: 'Active',
      isAdministrator: false,
      displayName: 'Lost owner',
    });

    const projection = await visibility.projectReport(actor, reportId);

    expect(projection.columns).toContain('lostReportOwner');
    expect(projection.recoveryResponses).toHaveLength(1);
    expect(projection.recoveryResponses[0]?.responseId).toBe(responseId);
  });

  it('offers Select for verification on the review screen', async () => {
    const actor = createActorContext({
      actorId: ownerId,
      status: 'Active',
      isAdministrator: false,
      displayName: 'Lost owner',
    });

    const reading = await readReviewResponses(actor, reportId);

    expect(reading).not.toBeNull();
    expect(reading?.rows).toHaveLength(1);
    expect(reading?.rows[0]?.canSelect).toBe(true);
  });
});
