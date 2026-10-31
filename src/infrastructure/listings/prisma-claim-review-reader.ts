/**
 * The Prisma implementation of the claim review reader.
 *
 * **One statement assembles the screen's facts.** The Claim, the item, and
 * the competing Claims are three tables, and the screen needs all three.
 * Reading them in one statement means the screen is assembled from a
 * single consistent view — a Claim that was `Pending` when it was read but
 * decided before the competitors were read cannot produce a screen that
 * offers a decision action on a decided Claim.
 *
 * **The competing-claim filter is in the `WHERE` clause, not in the
 * application.** Only `Pending` Claims compete, and the Claim being
 * reviewed is excluded by id — a Claim is not its own competitor. The
 * filter is a query constraint, which is what makes the answer both cheap
 * and correct.
 *
 * **The evidence is read here because an administrator is entitled to
 * it.** FR-37 and FR-39 permit an administrator to see the reason and the
 * identifying details; the route refuses a non-administrator before this
 * reader is called.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type {
  ClaimReviewFacts,
  ClaimReviewReader,
} from '@/application/listings/ports/claim-review-reader';

import {
  CLAIM_PENDING_STATUS,
  isClaimStatus,
  type ClaimStatus,
} from '@/domain/listings';

/** The Prisma claim review reader. */
export class PrismaClaimReviewReader implements ClaimReviewReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the review screen's facts.
   *
   * **The item's own Sensitive Fields are not selected.** The review
   * screen is about the *Claim*; the exact place and the item's own
   * identifying details belong to the reporter and are not what the
   * administrator is judging.
   */
  async readReviewFacts(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<ClaimReviewFacts | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const rows = await client.$queryRaw<
      Array<{
        id: string;
        status: string;
        report_id: string;
        reason: string | null;
        identifying_details: string | null;
        date_lost: Date | null;
        submitted_at: Date | null;
        name: string;
        category: string;
        date: Date;
        campus_area: string;
      }>
    >(Prisma.sql`
      SELECT c."id", c."status", c."report_id", c."reason", c."identifying_details",
             c."date_lost", c."submitted_at",
             r."name", r."category", r."date", r."campus_area"
      FROM "claims" AS c
      JOIN "reports" AS r ON r."id" = c."report_id"
      WHERE c."id" = ${claimId}::uuid
    `);

    const row = rows[0];

    if (!row) {
      return null;
    }

    // ── The competing Claims ──────────────────────────────────────────────
    //
    // **A second statement, because the competing set depends on the
    // report's id** — which is only known once the Claim has been read.
    // Both statements run inside the same transaction when one is
    // supplied, so the screen is still assembled from a consistent view.
    const competitors = await client.$queryRaw<
      Array<{ id: string; submitted_at: Date | null }>
    >(Prisma.sql`
      SELECT c."id", c."submitted_at"
      FROM "claims" AS c
      WHERE c."report_id" = ${row.report_id}::uuid
        AND c."status" = ${CLAIM_PENDING_STATUS}
        AND c."id" <> ${row.id}::uuid
      ORDER BY c."submitted_at" ASC, c."id" ASC
    `);

    const status: ClaimStatus = isClaimStatus(row.status) ? row.status : 'Rejected';

    return {
      claim: {
        claimId: row.id,
        status,
        reportId: row.report_id,
        // **A Claim that was never submitted through the form carries no
        // evidence.** A lifecycle-written Claim is a decided one, and its
        // reason and details are genuinely absent — the screen shows the
        // empty string rather than pretending there was something there.
        reason: row.reason ?? '',
        identifyingDetails: row.identifying_details ?? '',
        dateLost: formatIsoDay(row.date_lost),
        submittedAt: row.submitted_at ?? new Date(0),
      },
      item: {
        name: row.name,
        category: row.category,
        date: formatIsoDay(row.date),
        campusArea: row.campus_area,
      },
      competingClaims: competitors.map((competitor) => ({
        claimId: competitor.id,
        // **A Claim with no submission time sorts first.** The column is
        // nullable because bolt 008 created the table before the
        // submission flow existed, and a Claim with no submission time is
        // older than every Claim that has one.
        submittedAt: competitor.submitted_at ?? new Date(0),
      })),
    };
  }
}

/**
 * Format a date column as `YYYY-MM-DD`.
 *
 * **The calendar day, not an instant.** The report's and the claim's dates
 * are calendar days, and a timezone-sensitive conversion would shift the
 * day for a reader west of UTC.
 */
function formatIsoDay(value: Date | null): string {
  if (!value) {
    return '';
  }

  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Extract the transaction client from a handle.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('$queryRaw' in candidate)) {
    throw new Error(
      'A claim review must read inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}
