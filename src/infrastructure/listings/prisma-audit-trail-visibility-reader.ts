/**
 * The Prisma implementation of the audit trail visibility reader.
 *
 * **The refusal happens before the query.** A column set that does not
 * include the administrator column receives `null` — an **explicit**
 * absence — and **no query is issued at all**. A query that returned an
 * empty array would make "forbidden" indistinguishable from "empty", which
 * is precisely what ADR-8 forbids: the trail's absence must be legible as
 * an absence, not as a zero-length result.
 *
 * **The trail is administrator-only** (FR-32). The member-facing status
 * history is a different artefact — it is the timestamp of the report's most
 * recent event, and nothing else.
 *
 * This reader **reads** the trail; it does not record the read. Recording the
 * read is Unit 006's `AuditReadRecorder` capability, and the wiring lands in
 * bolt `009`, where a trail-reading route first exists.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  AuditTrailVisibilityReader,
  TrailEvent,
} from '@/application/listings/ports';
import type { ProjectionColumn } from '@/domain/listings';
import { auditSelectColumns, renderSelectList } from './select-builder';
import { PHYSICAL, TABLES, physical, quoteName, rowAlias } from './physical-columns';

/** The row shape the trail query returns. */
interface AuditTrailQueryRow {
  id: string;
  event_number: number | null;
  event_type: string;
  parent_type: string;
  parent_id: string;
  actor_id: string;
  actor_role: string;
  reason: string | null;
  previous_values: unknown;
  changed_fields: unknown;
  metadata: unknown;
  occurred_at: Date;
  created_at: Date;
}

/** The Prisma audit trail visibility reader. */
export class PrismaAuditTrailVisibilityReader implements AuditTrailVisibilityReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Load a report's trail for a column set.
   *
   * Returns `null` for a column set that is not the administrator's, and
   * issues **no query**.
   */
  async loadTrailForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
  ): Promise<readonly TrailEvent[] | null> {
    if (!columns.includes('administrator')) {
      return null;
    }

    const selectColumns = auditSelectColumns(columns);
    const selectList = selectColumns
      .map((column) => `a.${physical(column, PHYSICAL.audit)} AS ${quoteName(rowAlias(column))}`)
      .join(', ');

    const rows = await this.client.$queryRaw<AuditTrailQueryRow[]>(
      Prisma.sql`
        SELECT
          ${Prisma.raw(selectList)}
        FROM ${Prisma.raw(quoteName(TABLES.audit))} a
        WHERE a.${Prisma.raw(quoteName(PHYSICAL.audit.parentId))} = ${reportId}
        ORDER BY a.${Prisma.raw(quoteName(PHYSICAL.audit.occurredAt))} ASC
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      eventNumber: row.event_number,
      eventType: row.event_type,
      parentType: row.parent_type,
      parentId: row.parent_id,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      reason: row.reason,
      previousValues: row.previous_values,
      changedFields: row.changed_fields,
      metadata: row.metadata,
      occurredAt: row.occurred_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    }));
  }
}

export { renderSelectList };
