/**
 * The Prisma implementation of the report image reader.
 *
 * **One query, one snapshot.** The image's path and the viewer's
 * relationship to the report are read together, so the authorisation
 * decision is made against a consistent view of both. A reader that loaded
 * the path and the relationship separately could in principle decide on one
 * and read the other — and the gap between two reads is where a report that
 * was replaced, or a claim that was withdrawn, becomes a leak.
 *
 * **`LEFT JOIN`, not `INNER JOIN`.** An unrelated member has no Claim and no
 * Recovery Response, and an inner join would return zero rows for them —
 * indistinguishable from "the report does not exist". The report's
 * existence must never depend on the viewer's relationships.
 *
 * **The `image_ref` column is selected only when it is not null — which is
 * the reader's own answer.** A report with no image produces no row here,
 * and the service turns that into the same refusal a viewer without
 * permission receives. A viewer who may not have the image must not be able
 * to learn whether the report has one.
 *
 * **No content type is read, because none is stored.** The report row
 * carries the blob *path* and nothing else — the schema's field set is
 * closed (FR-8). The served type is derived from the image's bytes when
 * they are read.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  ReportImageReader,
  ReportImageReference,
} from '@/application/listings/ports/report-image-reader';
import { createReportRelationship, type ReportRelationship } from '@/domain/listings';
import { PHYSICAL, TABLES, quoteName } from './physical-columns';

/** The row shape the image query returns. */
interface ImageQueryRow {
  report_id: string;
  report_type: string;
  reporter_id: string;
  image_ref: string | null;
  claim_id: string | null;
  recovery_response_id: string | null;
}

/** The Prisma report image reader. */
export class PrismaReportImageReader implements ReportImageReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Load a report's image and the viewer's relationship to the report.
   *
   * Returns `null` when the report does not exist, when it has no image, or
   * when the viewer is not a member — the three are deliberately
   * indistinguishable.
   */
  async loadImageForViewer(
    reportId: string,
    viewerId: string,
  ): Promise<{ readonly image: ReportImageReference; readonly relationship: ReportRelationship } | null> {
    const rows = await this.client.$queryRaw<ImageQueryRow[]>(
      Prisma.sql`
        SELECT
          r.${Prisma.raw(quoteName(PHYSICAL.report.id))}        AS report_id,
          r.${Prisma.raw(quoteName(PHYSICAL.report.type))}        AS report_type,
          r.${Prisma.raw(quoteName(PHYSICAL.report.reporterId))}  AS reporter_id,
          r.${Prisma.raw(quoteName(PHYSICAL.report.imageRef))}    AS image_ref,
          c.${Prisma.raw(quoteName(PHYSICAL.claim.id))}            AS claim_id,
          rr.${Prisma.raw(quoteName(PHYSICAL.response.id))}        AS recovery_response_id
        FROM ${Prisma.raw(quoteName(TABLES.report))} r
        LEFT JOIN ${Prisma.raw(quoteName(TABLES.claim))} c
          ON c.${Prisma.raw(quoteName(PHYSICAL.claim.reportId))} = r.${Prisma.raw(quoteName(PHYSICAL.report.id))}
         AND c.${Prisma.raw(quoteName(PHYSICAL.claim.claimantId))} = ${viewerId}
        LEFT JOIN ${Prisma.raw(quoteName(TABLES.response))} rr
          ON rr.${Prisma.raw(quoteName(PHYSICAL.response.reportId))} = r.${Prisma.raw(quoteName(PHYSICAL.report.id))}
         AND rr.${Prisma.raw(quoteName(PHYSICAL.response.responderId))} = ${viewerId}
        WHERE r.${Prisma.raw(quoteName(PHYSICAL.report.id))} = ${reportId}
          AND r.${Prisma.raw(quoteName(PHYSICAL.report.imageRef))} IS NOT NULL
        LIMIT 1
      `,
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    const relationship = createReportRelationship({
      reportId: row.report_id,
      reportType: row.report_type === 'Found' ? 'Found' : 'Lost',
      reporterId: row.reporter_id,
      viewerId,
      claimId: row.claim_id,
      recoveryResponseId: row.recovery_response_id,
    });

    return { image: { path: row.image_ref! }, relationship };
  }
}
