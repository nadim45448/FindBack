/**
 * The insert-only audit-event repository.
 *
 * **There is deliberately no `update`, `delete`, or `upsert` method.** The
 * interface is the first of the three enforcement layers for story
 * `004-append-only-enforcement`: append-only is structural, not a permission
 * check that could later be widened.
 *
 * The database trigger is the second layer. `AuditWriter` being the only
 * writer is the third.
 */

import type { AuditEvent, TrailCursor, TrailFilters } from '@/domain/audit';
import type { TransactionHandle } from './transaction-handle';

/** The fields a repository writes. Mirrors the persisted shape. */
export interface AuditEventRecord {
  readonly id: string;
  readonly eventNumber: number | null;
  readonly eventType: string;
  readonly parentType: string;
  readonly parentId: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly actingAdministratorId: string | null;
  readonly determinedByUserId: string | null;
  readonly recordedByAdministratorId: string | null;
  readonly reason: string | null;
  readonly previousValues: unknown;
  readonly changedFields: unknown;
  readonly metadata: unknown;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

/**
 * An insert-only repository for audit events.
 *
 * Every write takes the caller's transaction handle, so an insert cannot
 * commit on its own.
 */
export interface AuditEventRepository {
  /**
   * Append one event inside the caller's transaction.
   *
   * @throws {AuditWriteOutsideTransactionError} when the handle is missing.
   */
  append(event: AuditEventRecord, transaction: TransactionHandle): Promise<AuditEvent>;

  /**
   * Read a page of a trail, newest first.
   *
   * Cursor pagination on `(occurredAt, id)` — `OFFSET` degrades linearly with
   * depth and would break the 1 s p95 target on a deep trail.
   *
   * `filters` applies UX §17.3's three filters. Every filter is optional and
   * its clause is omitted when absent, so an absent filter never narrows the
   * result. The filters narrow; they never reorder — the order is fixed
   * reverse-chronologically.
   */
  listByParent(
    parentType: string,
    parentId: string,
    cursor: TrailCursor | null,
    limit: number,
    filters?: TrailFilters,
  ): Promise<TrailPage>;

  /**
   * Read a page of the whole trail, newest first.
   *
   * A backend capability with no route (ADR-8): it exists for the operational
   * review the read log supports, and it is administrator-gated by the same
   * pre-query check as the contextual read.
   */
  listAll(cursor: TrailCursor | null, limit: number, filters?: TrailFilters): Promise<TrailPage>;
}

/**
 * The cursor position in the trail.
 *
 * Re-exported from the domain layer so there is exactly one definition of the
 * cursor tuple.
 */
export type { TrailCursor } from '@/domain/audit';
/** A page of trail entries. */
export interface TrailPage {
  readonly events: readonly AuditEvent[];
  /** The cursor for the next page, or null when the trail is exhausted. */
  readonly nextCursor: TrailCursor | null;
}
