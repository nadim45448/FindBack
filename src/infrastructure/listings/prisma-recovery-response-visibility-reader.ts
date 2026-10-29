/**
 * The Prisma implementation of the Recovery Response visibility reader.
 *
 * **The scope and the field set are independent.** `visibleResponseIds` is
 * the existence scope — `null` means "every response on this report" (the
 * Lost-report owner and administrator scopes); an **empty array** means "no
 * responses", and the implementation must **not** fall back to "all responses
 * for the report".
 *
 * The **`SELECT` list** is the field scope. The responder-supplied fields —
 * where found, observed identifying details, date found, candidate image —
 * are FR-37 Sensitive Fields, and a column set that may not see them has them
 * **absent from the SQL**.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { RecoveryResponseVisibilityReader } from '@/application/listings/ports';
import type { ProjectionColumn, RecoveryResponseRow } from '@/domain/listings';
import { renderSelectList, responseSelectColumns } from './select-builder';
import { PHYSICAL, TABLES, physical, quoteName } from './physical-columns';

/** The row shape the Recovery Response query returns. */
interface RecoveryResponseQueryRow {
  id: string;
  report_id: string;
  responder_id: string;
  status: string;
  submitted_at: Date;
  where_found_exact_place?: string | null;
  observed_identifying_details?: string | null;
  date_found?: Date | null;
  candidate_image_ref?: string | null;
}

/** The Prisma Recovery Response visibility reader. */
export class PrismaRecoveryResponseVisibilityReader implements RecoveryResponseVisibilityReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Load the Recovery Responses for a report, scoped to the visible ids.
   *
   * An empty scope returns early, so no query is issued at all — the
   * "never fall back to all responses" rule is structural rather than a
   * promise.
   */
  async loadResponsesForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
    visibleResponseIds: readonly string[] | null,
  ): Promise<readonly RecoveryResponseRow[]> {
    if (visibleResponseIds !== null && visibleResponseIds.length === 0) {
      return [];
    }

    const selectColumns = responseSelectColumns(columns);
    const selectList = selectColumns
      .map((column) => `rr.${physical(column, PHYSICAL.response)}`)
      .join(', ');

    const scopeFilter =
      visibleResponseIds === null
        ? Prisma.empty
        : Prisma.sql`AND rr.${Prisma.raw(quoteName(PHYSICAL.response.id))} IN (${Prisma.join(visibleResponseIds)})`;

    const rows = await this.client.$queryRaw<RecoveryResponseQueryRow[]>(
      Prisma.sql`
        SELECT
          ${Prisma.raw(selectList)}
        FROM ${Prisma.raw(quoteName(TABLES.response))} rr
        WHERE rr.${Prisma.raw(quoteName(PHYSICAL.response.reportId))} = ${reportId}
        ${scopeFilter}
        ORDER BY rr.${Prisma.raw(quoteName(PHYSICAL.response.submittedAt))} ASC
      `,
    );

    return rows.map((row) => {
      const projected: {
        id: string;
        reportId: string;
        responderId: string;
        status: string;
        submittedAt: string;
        whereFoundExactPlace?: string | null;
        observedIdentifyingDetails?: string | null;
        dateFound?: string | null;
        candidateImageRef?: string | null;
      } = {
        id: row.id,
        reportId: row.report_id,
        responderId: row.responder_id,
        status: row.status,
        submittedAt: row.submitted_at.toISOString(),
      };

      if (row.where_found_exact_place !== undefined) {
        projected.whereFoundExactPlace = row.where_found_exact_place;
      }

      if (row.observed_identifying_details !== undefined) {
        projected.observedIdentifyingDetails = row.observed_identifying_details;
      }

      if (row.date_found !== undefined) {
        projected.dateFound = row.date_found ? row.date_found.toISOString() : null;
      }

      if (row.candidate_image_ref !== undefined) {
        projected.candidateImageRef = row.candidate_image_ref;
      }

      return projected;
    });
  }
}

export { renderSelectList };
