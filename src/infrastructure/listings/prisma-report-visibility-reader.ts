/**
 * The Prisma implementation of the report visibility reader.
 *
 * **This is the layer where the authorisation decision becomes a query.**
 * The `SELECT` list is built from the resolved columns by `select-builder.ts`,
 * so a Sensitive Field the viewer may not see is **absent from the SQL** —
 * it is never read from the database, never materialised in the process, and
 * therefore never present to be filtered.
 *
 * **Raw SQL, not the Prisma query builder.** Prisma's `select` option would
 * express the same thing, but the reader must also build the conditional
 * `accounts` join and the conditional `audit_events` timestamp lookup, and
 * a raw statement makes the emitted SQL **assertable in a test** — which is
 * the property this whole mechanism rests on. A test that asserts on the
 * generated SQL proves the field was never selected; a test that asserts on
 * the response does not.
 *
 * **The schema is bolt `007`'s to create.** The column names this reader
 * uses are listed in the Stage 2 design § The report schema this bolt
 * assumes, and are the contract bolt `007` must satisfy.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { ReportVisibilityReader } from '@/application/listings/ports';
import {
  createReportRelationship,
  type ProjectionColumn,
  type ReportRelationship,
  type ReportRow,
} from '@/domain/listings';
import {
  lastActionTimestampColumns,
  renderSelectList,
  reporterSelectColumns,
  reportSelectColumns,
} from './select-builder';
import { PHYSICAL, TABLES, physical, quoteName, rowAlias } from './physical-columns';

/** The row shape the report query returns. */
interface ReportQueryRow {
  id: string;
  type: string;
  status: string;
  name: string | null;
  category: string | null;
  date: Date | null;
  campus_area: string | null;
  description: string | null;
  image_ref: string | null;
  reporter_id: string | null;
  exact_place: string | null;
  identifying_details: string | null;
  reporter_display_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
  last_action_at: Date | null;
}

/** The row shape the relationship query returns. */
interface RelationshipQueryRow {
  report_id: string;
  report_type: string;
  reporter_id: string;
  claim_id: string | null;
  recovery_response_id: string | null;
}

/** The Prisma report visibility reader. */
export class PrismaReportVisibilityReader implements ReportVisibilityReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Load the relationship facts for a viewer.
   *
   * **`LEFT JOIN`, not `INNER JOIN`.** An unrelated member has no Claim and
   * no Recovery Response, and an inner join would return **zero rows** for
   * them — indistinguishable from "the report does not exist". The report's
   * existence must never depend on the viewer's relationships.
   *
   * The query returns only ids and two equality facts. It carries **no
   * report content**, so it cannot itself leak.
   */
  async loadRelationship(
    reportId: string,
    viewerId: string | null,
  ): Promise<ReportRelationship | null> {
    const rows = await this.client.$queryRaw<RelationshipQueryRow[]>(
      Prisma.sql`
        SELECT
          r.${Prisma.raw(quoteName(PHYSICAL.report.id))}        AS report_id,
          r.${Prisma.raw(quoteName(PHYSICAL.report.type))}        AS report_type,
          r.${Prisma.raw(quoteName(PHYSICAL.report.reporterId))}  AS reporter_id,
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
        LIMIT 1
      `,
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return createReportRelationship({
      reportId: row.report_id,
      reportType: row.report_type === 'Found' ? 'Found' : 'Lost',
      reporterId: row.reporter_id,
      viewerId,
      claimId: row.claim_id,
      recoveryResponseId: row.recovery_response_id,
    });
  }

  /**
   * Load a report for a column set.
   *
   * The `SELECT` list is built from the columns, so an unauthorised
   * Sensitive Field is **not in the SQL**. The `accounts` join is issued
   * **only** when the columns grant the reporter's name or contact details.
   */
  async loadReportForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
  ): Promise<ReportRow | null> {
    const reportColumns = reportSelectColumns(columns);
    const reporterColumns = reporterSelectColumns(columns);

    const selectList = reportColumns
      .map((column) => `r.${physical(column, PHYSICAL.report)} AS ${quoteName(rowAlias(column))}`)
      .join(', ');

    // The reporter's columns are aliased with a `reporter_` prefix, because
    // the mapper reads them under names of their own — `reporter_display_name`
    // and `reporter_email` — and the `accounts` table's columns are
    // camelCase (`displayName`, `email`), which the raw driver would return
    // under their own names. The alias is what makes the mapper's contract
    // explicit; without it the field is silently `undefined`.
    const reporterSelectList = reporterColumns
      .map(
        (column) =>
          `a.${physical(column, PHYSICAL.account)} AS ${quoteName(`reporter_${rowAlias(column)}`)}`,
      )
      .join(', ');

    const joins =
      reporterSelectList.length > 0
        ? Prisma.sql`LEFT JOIN ${Prisma.raw(quoteName(TABLES.account))} a ON a.${Prisma.raw(quoteName(PHYSICAL.account.id))} = r.${Prisma.raw(quoteName(PHYSICAL.report.reporterId))}`
        : Prisma.empty;

    // The member-facing status history is the timestamp of the report's most
    // recent audit event — **and nothing else**. The event row is never
    // selected for a non-administrator, because it carries the actor and the
    // event type, which is trail content (FR-32).
    const lastActionSelect = Prisma.sql`
      (
        SELECT a2.${Prisma.raw(quoteName(PHYSICAL.audit.occurredAt))}
        FROM ${Prisma.raw(quoteName(TABLES.audit))} a2
        WHERE a2.${Prisma.raw(quoteName(PHYSICAL.audit.parentId))} = r.${Prisma.raw(quoteName(PHYSICAL.report.id))}
        ORDER BY a2.${Prisma.raw(quoteName(PHYSICAL.audit.occurredAt))} DESC
        LIMIT 1
      ) AS last_action_at
    `;

    // **The comma belongs to the subquery, not to whatever precedes it.**
    //
    // The report columns are always present, but the reporter's columns
    // are not — an anonymous viewer's column set grants neither the
    // reporter's name nor their contact details, so the `accounts` join is
    // not issued and the reporter's columns are absent from the list. A
    // comma attached to the *preceding* fragment would therefore be
    // missing exactly when the fragment is, which is the anonymous case.
    //
    // Putting the comma on the subquery makes the list correct for every
    // column set: the report columns, then the reporter's columns if
    // granted, then the timestamp — each separated, none trailing.
    const reporterSelection =
      reporterSelectList.length > 0 ? Prisma.raw(`, ${reporterSelectList}`) : Prisma.empty;

    const rows = await this.client.$queryRaw<ReportQueryRow[]>(
      Prisma.sql`
        SELECT
          ${Prisma.raw(selectList)}
          ${reporterSelection}
          , ${lastActionSelect}
        FROM ${Prisma.raw(quoteName(TABLES.report))} r
        ${joins}
        WHERE r.${Prisma.raw(quoteName(PHYSICAL.report.id))} = ${reportId}
        LIMIT 1
      `,
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      type: row.type === 'Found' ? 'Found' : 'Lost',
      status: row.status,
      name: row.name,
      category: row.category,
      date: row.date ? row.date.toISOString() : null,
      campusArea: row.campus_area,
      description: row.description,
      imageRef: row.image_ref,
      reporterDisplayName: row.reporter_display_name,
      exactPlace: row.exact_place,
      identifyingDetails: row.identifying_details,
      reporterEmail: row.reporter_email,
      reporterPhone: row.reporter_phone,
      lastActionAt: row.last_action_at ? row.last_action_at.toISOString() : null,
    };
  }
}

export { renderSelectList, lastActionTimestampColumns };
