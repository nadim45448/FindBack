/**
 * The audit trail visibility reader port.
 *
 * **Administrators only.** The trail is administrator-only (FR-32), and the
 * refusal happens **before** the query — a filter that returns an empty
 * result would make "forbidden" indistinguishable from "empty" and leak
 * existence through the result count (ADR-8).
 *
 * The reader returns `null` — an **explicit** absence — when the columns do
 * not include the administrator column. Not an empty array.
 *
 * **This port reads the trail; it does not record the read.** Recording the
 * read is Unit 006's `AuditReadRecorder` capability, and the wiring lands in
 * bolt `009`, where a trail-reading route first exists. Vercel Hobby retains
 * runtime logs for only one hour, so the read record in the database is the
 * durable artefact (ADR-7).
 */

import type { ProjectionColumn } from '@/domain/listings';

/**
 * The audit event, as the trail reader returns it.
 *
 * **This is the trail's projection shape, not the persisted event's.** The
 * domain's `AuditEvent` carries a `ParentRef`, an `ActorRef`, an
 * `AuditPayload`, and `Date` timestamps; the trail flattens those into
 * plain fields with ISO-8601 strings, because the trail is read out of the
 * database and rendered, not rehydrated into domain objects.
 *
 * It was `unknown` before this bolt's integration test read a real event
 * out of the database. `unknown` compiles for every reader and constrains
 * none of them, so it could not catch a field the reader failed to
 * populate — and the reader *did* fail, silently, until the aliasing fix.
 */
export interface TrailEvent {
  readonly id: string;
  readonly eventNumber: number | null;
  readonly eventType: string;
  readonly parentType: string;
  readonly parentId: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly reason: string | null;
  readonly previousValues: unknown;
  readonly changedFields: unknown;
  readonly metadata: unknown;
  readonly occurredAt: string;
  readonly createdAt: string;
}

/** Reads the audit trail for a column set. */
export interface AuditTrailVisibilityReader {
  /**
   * Load a report's trail for a column set.
   *
   * Returns `null` when the columns do not include the administrator
   * column — the refusal is explicit, and no query is issued.
   */
  loadTrailForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
  ): Promise<readonly TrailEvent[] | null>;
}
