/**
 * Member dashboard counts — against a live database.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaMemberDashboardReader } from './prisma-member-dashboard-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the member dashboard reader (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const finderId = '00000000-0000-4000-8000-000000000801';
  const claimantId = '00000000-0000-4000-8000-000000000802';

  const reader = new PrismaMemberDashboardReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'Finder', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'Claimant', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      finderId,
      'finder-dashboard@example.test',
      claimantId,
      'claimant-dashboard@example.test',
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "claimant_id" = $1`, claimantId);
    await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "reporter_id" = $1`, finderId);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2)`,
      finderId,
      claimantId,
    );
    await prisma.$disconnect();
  });

  it('counts a returned Found item for the approved claimant, not only the author', async () => {
    const reportRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Returned', 'Returned backpack', 'Bag',
               'A returned backpack.', DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      finderId,
    );

    const reportId = reportRows[0]!.id;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                              "reason", "identifying_details", "date_lost",
                              "decided_at", "created_at", "updated_at")
       VALUES ($1, $2, 'Approved', NOW(),
               'It is my returned backpack — lost near the library last week.',
               'Red tag in the main pocket.', DATE '2026-10-20', NOW(), NOW(), NOW())`,
      reportId,
      claimantId,
    );

    const finderStats = await reader.readForMember(finderId);
    const claimantStats = await reader.readForMember(claimantId);

    expect(finderStats.returnedAuthoredReports).toBe(1);
    expect(finderStats.returnedReceivedClaims).toBe(0);
    expect(finderStats.returnedItems).toBe(1);

    expect(claimantStats.returnedAuthoredReports).toBe(0);
    expect(claimantStats.returnedReceivedClaims).toBe(1);
    expect(claimantStats.returnedItems).toBe(1);
  });
});
