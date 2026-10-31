/**
 * The Prisma implementation of the return-subject reader.
 *
 * **The approved claimant is resolved here, and only here.** A Found report's
 * default receiver is the claimant on its *approved* Claim — and that
 * claimant is a row on the `claims` table, not a column on the report. The
 * reader resolves it so the domain's derivation receives a plain id rather
 * than a Claim row it would have to understand.
 *
 * **The query names the status, so the query is the direction's rule.** A
 * Found report's approved claimant is the claimant on a Claim whose status
 * is `Approved`; a Lost report has no Claims at all. So the `claims` relation
 * is filtered on `status = 'Approved'` in the `WHERE` clause rather than
 * filtered in TypeScript — and a report whose only Claim is `Pending` reads
 * as *no approved claimant*, which is the truth.
 *
 * **The reads select only the columns the confirmation reasons about.** The
 * report's Sensitive Fields — `exact_place` and `identifying_details` — are
 * not selected, so they cannot leak into the confirmation's audit payload.
 *
 * **A report of an unknown type reads as `null`.** The type is narrowed
 * against the domain's own `ReportType` before it is returned, so a report
 * whose stored type is neither `Lost` nor `Found` never reaches the
 * application layer.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  ReturnSubject,
  ReturnSubjectReader,
} from '@/application/listings/ports/return-subject-reader';

import { type ReportStatus } from '@/domain/listings';

// **Imported from the source module, not the barrel.** `report-relationship.ts`
// re-exports `isReportType` with `export type { … }`, which erases the
// *value* — the function survives as a type but not as a callable. The
// barrel therefore cannot be the home of the value, and this adapter needs
// the value.
import { isReportType } from '@/domain/listings/report-type';

/** The Claim status that makes its claimant the default receiver. */
const APPROVED_CLAIM_STATUS = 'Approved';

/** Prisma's return-subject reader. */
export class PrismaReturnSubjectReader implements ReturnSubjectReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the report a return confirmation acts on.
   *
   * @returns the subject, or `null` when no report carries that id, or when
   * the report's type is not one the domain owns.
   */
  async readReturnSubject(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<ReturnSubject | null> {
    const client = transaction
      ? (transaction.transaction as Prisma.TransactionClient)
      : this.client;

    const found = await client.report.findFirst({
      where: { id: reportId },
      select: {
        id: true,
        type: true,
        status: true,
        reporterId: true,
        // **The approved claimant.** The relation is filtered on the Claim's
        // own status, so a Pending Claim never contributes a claimant and a
        // report with two Claims of which one is approved contributes
        // exactly that one.
        claims: {
          where: { status: APPROVED_CLAIM_STATUS },
          select: { claimantId: true },
          take: 1,
        },
      },
    });

    if (found === null) {
      return null;
    }

    // **A report type the domain does not own reads as absent.** The
    // derivation's table is total over the two types, and a report of a
    // third type has no default receiver and no precondition — so it is not
    // a report this confirmation can act on.
    if (!isReportType(found.type)) {
      return null;
    }

    return {
      id: found.id,
      type: found.type,
      status: found.status as ReportStatus,
      reporterId: found.reporterId,
      approvedClaimantId: found.claims[0]?.claimantId ?? null,
    };
  }
}
