/**
 * The Prisma implementation of the Claim visibility reader.
 *
 * **Two scopes, and they are not the same thing.**
 *
 * `visibleClaimIds` is the set of Claims the viewer may **see at all** — the
 * existence scope. `null` means "every Claim on this report" (the
 * Found-report owner and administrator scopes); an **empty array** means
 * "no Claims", and the implementation must **not** fall back to "all Claims
 * for the report". That distinction is the difference between a scoped read
 * and a leak.
 *
 * The **`SELECT` list** is the field scope. The claimant's `reason` and
 * `identifying_details` are FR-37 Sensitive Fields, and a Found-report owner
 * never receives them — so for that column set they are **absent from the
 * SQL**. The column set also decides whether the evidence columns are read
 * at all, independently of which rows are returned.
 *
 * The `audit_light_history` is a per-Claim member-facing history: a status
 * and a timestamp per entry, **never** the trail. It carries no actor, no
 * event type, no reason, and no metadata.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { ClaimVisibilityReader } from '@/application/listings/ports';
import type { ClaimRow, ProjectionColumn } from '@/domain/listings';
import { claimSelectColumns, renderSelectList } from './select-builder';
import { PHYSICAL, TABLES, physical, quoteName } from './physical-columns';

/**
 * The per-Claim member-facing history.
 *
 * **Status and timestamp only.** The trail is administrator-only (FR-32), and
 * the member-facing history is not the trail — it is the Claim's own status
 * history, readable by the claimant. Selecting `actor_id` or `reason` here
 * would put trail content in a non-administrator's hands.
 */
const AUDIT_LIGHT = {
  eventType: quoteName(PHYSICAL.audit.eventType),
  occurredAt: quoteName(PHYSICAL.audit.occurredAt),
} as const;

/** The row shape the Claim query returns. */
interface ClaimQueryRow {
  id: string;
  report_id: string;
  claimant_id: string;
  status: string;
  submitted_at: Date;
  reason?: string | null;
  identifying_details?: string | null;
  date_lost?: Date | null;
  audit_light_history?: AuditLightRow[] | null;
}

interface AuditLightRow {
  event_type: string;
  occurred_at: Date;
}

/** The Prisma Claim visibility reader. */
export class PrismaClaimVisibilityReader implements ClaimVisibilityReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Load the Claims for a report, scoped to the visible Claim ids.
   *
   * **`null` means every Claim on the report.** The `visibleClaimIds` array is
   * the already-scoped set, and an empty array is honoured literally — no
   * Claim is read at all, and the query is not issued.
   */
  async loadClaimsForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
    visibleClaimIds: readonly string[] | null,
  ): Promise<readonly ClaimRow[]> {
    // An empty scope means no Claims are visible. Returning early keeps the
    // "no fallback to all Claims" rule **structural** — there is no query
    // that could accidentally widen the scope.
    if (visibleClaimIds !== null && visibleClaimIds.length === 0) {
      return [];
    }

    const selectColumns = claimSelectColumns(columns);
    const selectList = selectColumns
      .map((column) => `c.${physical(column, PHYSICAL.claim)}`)
      .join(', ');

    // The audit-light history is granted only where the private evidence is
    // granted: the claimant on their own Claim, and an administrator. It
    // rides on the same rule so the two cannot diverge.
    const withAuditLight = columns.includes('administrator') || columns.includes('claimant');

    const auditLightSelect = withAuditLight
      ? Prisma.sql`
          , COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'event_type', a2.${Prisma.raw(AUDIT_LIGHT.eventType)},
                  'occurred_at', a2.${Prisma.raw(AUDIT_LIGHT.occurredAt)}
                )
                ORDER BY a2.${Prisma.raw(AUDIT_LIGHT.occurredAt)} ASC
              )
              FROM ${Prisma.raw(quoteName(TABLES.audit))} a2
              WHERE a2.${Prisma.raw(quoteName(PHYSICAL.audit.parentId))} = c.${Prisma.raw(quoteName(PHYSICAL.claim.id))}
            ),
            '[]'::json
          ) AS audit_light_history
        `
      : Prisma.empty;

    const scopeFilter =
      visibleClaimIds === null
        ? Prisma.empty
        : Prisma.sql`AND c.${Prisma.raw(quoteName(PHYSICAL.claim.id))} IN (${Prisma.join(visibleClaimIds)})`;

    const rows = await this.client.$queryRaw<ClaimQueryRow[]>(
      Prisma.sql`
        SELECT
          ${Prisma.raw(selectList)}
          ${auditLightSelect}
        FROM ${Prisma.raw(quoteName(TABLES.claim))} c
        WHERE c.${Prisma.raw(quoteName(PHYSICAL.claim.reportId))} = ${reportId}
        ${scopeFilter}
        ORDER BY c.${Prisma.raw(quoteName(PHYSICAL.claim.submittedAt))} ASC
      `,
    );

    return rows.map((row) => {
      const projected: {
        id: string;
        reportId: string;
        claimantId: string;
        status: string;
        submittedAt: string;
        reason?: string | null;
        identifyingDetails?: string | null;
        dateLost?: string | null;
        auditLightHistory?: readonly { status: string; at: string }[];
      } = {
        id: row.id,
        reportId: row.report_id,
        claimantId: row.claimant_id,
        status: row.status,
        submittedAt: row.submitted_at.toISOString(),
      };

      // The evidence columns are present in the row **only** when the column
      // set granted them, because they are absent from the `SELECT` list
      // otherwise. The optional key is left off the row entirely.
      if (row.reason !== undefined) {
        projected.reason = row.reason;
      }

      if (row.identifying_details !== undefined) {
        projected.identifyingDetails = row.identifying_details;
      }

      if (row.date_lost !== undefined) {
        projected.dateLost = row.date_lost ? row.date_lost.toISOString() : null;
      }

      if (row.audit_light_history !== undefined && row.audit_light_history !== null) {
        projected.auditLightHistory = row.audit_light_history.map((entry) => ({
          status: entry.event_type,
          at: entry.occurred_at.toISOString(),
        }));
      }

      return projected;
    });
  }
}

export { renderSelectList };
