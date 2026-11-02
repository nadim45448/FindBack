/**
 * Claim detail must stay visible after admin approval — the `/my/claims/:id`
 * page reads through the FR-39 projection.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createActorContext } from '@/domain/accounts/actor-context';
import { ReportVisibilityService } from '@/application/listings/report-visibility-service';

import { PrismaClaimVisibilityReader } from './prisma-claim-visibility-reader';
import { PrismaRecoveryResponseVisibilityReader } from './prisma-recovery-response-visibility-reader';
import { PrismaReportVisibilityReader } from './prisma-report-visibility-reader';
import { PrismaThreadVisibilityReader } from './prisma-thread-visibility-reader';
import { PrismaAuditTrailVisibilityReader } from './prisma-audit-trail-visibility-reader';

import { readClaimDetail } from '@/app/my/claims/_claim-detail';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('claim detail visibility after approval (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const finderId = '00000000-0000-4000-8000-000000000791';
  const claimantId = '00000000-0000-4000-8000-000000000792';

  let reportId = '';
  let claimId = '';

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
       VALUES ($1, $2, 'not-a-real-hash', 'Finder', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'Baser Arman', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      finderId,
      'finder-claim-detail@example.test',
      claimantId,
      'baser-claim-detail@example.test',
    );

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Claim Approved', 'Blue backpack', 'Bag',
               'A blue backpack with a patch.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      finderId,
    );

    reportId = rows[0]!.id;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "report_id" = $1`, reportId);

    const claimRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                              "reason", "identifying_details", "date_lost",
                              "decided_at", "created_at", "updated_at")
       VALUES ($1, $2, 'Approved', NOW(),
               'It is my blue backpack — I lost it near the library stacks last week.',
               'Red tag inside the main pocket.', DATE '2026-10-20', NOW(), NOW(), NOW())
       RETURNING "id"`,
      reportId,
      claimantId,
    );

    claimId = claimRows[0]!.id;
  });

  afterAll(async () => {
    if (reportId.length > 0) {
      await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "report_id" = $1`, reportId);
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2)`,
      finderId,
      claimantId,
    );
    await prisma.$disconnect();
  });

  it('loads every claim id for the claimant on the report', async () => {
    const relationship = await new PrismaReportVisibilityReader(prisma).loadRelationship(
      reportId,
      claimantId,
    );

    expect(relationship?.claimIds).toContain(claimId);
    expect(relationship?.hasClaim).toBe(true);
  });

  it('includes the approved claim in the claimant projection', async () => {
    const actor = createActorContext({
      actorId: claimantId,
      status: 'Active',
      isAdministrator: false,
      displayName: 'Baser Arman',
    });

    const projection = await visibility.projectReport(actor, reportId);
    const own = projection.claims.find((claim) => claim.claimId === claimId);

    expect(own).toBeDefined();
    expect(own?.status).toBe('Approved');
  });

  it('readClaimDetail resolves an approved claim for the claimant', async () => {
    const actor = createActorContext({
      actorId: claimantId,
      status: 'Active',
      isAdministrator: false,
      displayName: 'Baser Arman',
    });

    const reading = await readClaimDetail(actor, claimId);

    expect(reading).not.toBeNull();
    expect(reading?.claimStatus).toBe('Approved');
  });

  it('readClaimDetail still resolves the approved claim when an older rejected one exists', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                              "reason", "identifying_details", "date_lost",
                              "rejection_reason", "decided_at", "created_at", "updated_at")
       VALUES ($1, $2, 'Rejected', NOW() - INTERVAL '1 day',
               'Earlier attempt — I thought this was my bag but the patch was different.',
               'Old details in the side pocket.', DATE '2026-10-19',
               'The identifying details did not match the found item.',
               NOW() - INTERVAL '1 day', NOW(), NOW())`,
      reportId,
      claimantId,
    );

    const actor = createActorContext({
      actorId: claimantId,
      status: 'Active',
      isAdministrator: false,
      displayName: 'Baser Arman',
    });

    const reading = await readClaimDetail(actor, claimId);

    expect(reading).not.toBeNull();
    expect(reading?.claimStatus).toBe('Approved');
  });
});
