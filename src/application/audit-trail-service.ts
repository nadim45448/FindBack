/**
 * The audit-trail read use case.
 *
 * This is the one place that sequences the three steps of a trail read:
 *
 * 1. **Authorize** — refuse a non-administrator *before* the query (ADR-8).
 * 2. **Query** — read a page of the trail.
 * 3. **Record** — write the read record, in its own transaction (ADR-7).
 *
 * The three steps live in three collaborators that do not know about each
 * other — `AuditTrailReader` reads, `AuditReadRecorder` writes, and neither
 * knows about the other. That separation is what makes each one testable
 * alone. This service is the use case that sequences them, and it is the only
 * place that knows the difference between a failure that must propagate (a
 * refusal, a failed query) and a failure that must not (a failed read
 * record).
 *
 * **A failed read record does not fail the read.** The administrator asked to
 * see the trail and can see it; losing the bookkeeping is an observability
 * gap, not a correctness failure for the request. This mirrors PRD §10's
 * email rule — "Email send failures are logged; the triggering action is not
 * blocked" — and `coding-standards.md`'s no-floating-promises rule, which
 * requires a failed background action to be recorded with a logged catch.
 */

import { PermissionDeniedError, ValidationError } from '@/lib/errors';
import type { AuditEvent } from '@/domain/audit';
import {
  clampTrailLimit,
  describeTrailFilters,
  describeTrailQuery,
  isTrailParentType,
  NO_TRAIL_FILTERS,
} from '@/domain/audit';
import type { TrailFilters, TrailParentType, TrailQuery } from '@/domain/audit';
import type { AuditTrailReader, TrailResult, TrailViewer } from './audit-trail-reader';
import type { AuditReadRecorder } from './audit-read-recorder';
import type { TransactionFactory } from './ports/transaction-factory';
import { classifyWriteFailure, READ_RECORD_MAX_ATTEMPTS } from './classify-write-failure';

/** The request context a read carries through to its record and its log. */
export interface TrailReadContext {
  /** Present on every line and on every record (PRD §10). */
  readonly requestId: string;
  /** The filters as the administrator applied them. */
  readonly filters?: TrailFilters | null;
}

/**
 * Reads the audit trail and records the read.
 *
 * The service owns the ordering guarantee — a read record exists only if the
 * read it describes completed — and the failure rule that makes a lost
 * bookkeeping record loud without being fatal.
 */
export class AuditTrailService {
  constructor(
    private readonly reader: AuditTrailReader,
    private readonly recorder: AuditReadRecorder,
    private readonly transactions: TransactionFactory,
    private readonly logger?: { log(context: ReadFailureContext): void },
  ) {}

  /**
   * Read one page of a parent's trail, and record the read.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   */
  async listByParent(
    viewer: TrailViewer,
    parentType: string,
    parentId: string,
    query: TrailQuery,
    context: TrailReadContext,
  ): Promise<TrailResult> {
    this.assertAdministrator(viewer);
    this.assertParentType(parentType);

    const limit = clampTrailLimit(query.limit);
    const filters = query.filters ?? NO_TRAIL_FILTERS;

    const page = await this.reader.listByParent(
      viewer,
      parentType,
      parentId,
      query.cursor ?? null,
      limit,
      filters,
    );

    await this.recordRead(
      viewer,
      describeTrailQuery({ ...query, parentType: parentType as TrailParentType, parentId }),
      filters,
      page.events.length,
      context,
    );

    return page;
  }

  /**
   * Read one page of the whole trail, and record the read.
   *
   * A backend capability with no route (ADR-8). It is administrator-gated by
   * the same pre-query check as the contextual read.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   */
  async listAll(
    viewer: TrailViewer,
    query: TrailQuery,
    context: TrailReadContext,
  ): Promise<TrailResult> {
    this.assertAdministrator(viewer);

    const limit = clampTrailLimit(query.limit);
    const filters = query.filters ?? NO_TRAIL_FILTERS;

    const page = await this.reader.listAll(viewer, query.cursor ?? null, limit, filters);

    await this.recordRead(viewer, describeTrailQuery(query), filters, page.events.length, context);

    return page;
  }

  /**
   * Record the read, in its own transaction, and survive a failure.
   *
   * The record is written only after the query has returned, so it evidences a
   * completed read. The write is retried on a transient failure (ADR-7), and
   * a failure that survives the retries is logged rather than propagated.
   *
   * **Each attempt opens its own transaction.** A failed statement aborts its
   * PostgreSQL transaction, so a retry inside the aborted one could never
   * succeed. The record's id is generated **once**, before the first attempt,
   * so every attempt writes the same id — and the primary key refuses a
   * duplicate, which is what makes the retry idempotent.
   */
  private async recordRead(
    viewer: TrailViewer,
    query: string,
    filters: TrailFilters,
    resultCount: number,
    context: TrailReadContext,
  ): Promise<void> {
    const id = crypto.randomUUID();

    try {
      await this.appendWithRetry(id, viewer, query, filters, resultCount, context);
    } catch (error) {
      // The read has already succeeded and is being returned. A failed
      // read record is an observability gap, not a failed request — so it is
      // logged, loudly, and swallowed. The log line is diagnostic; the table
      // row is the compliance artifact, and its absence is visible here.
      this.logger?.log({
        requestId: context.requestId,
        actorId: viewer.userId,
        action: 'audit.read_record_failed',
        targetType: 'audit_read_log',
        outcome: 'error',
        error: error instanceof Error ? error.message : String(error),
        ts: new Date().toISOString(),
      });
    }
  }

  /**
   * Append the record, retrying a transient failure.
   *
   * Only a transient failure is retried — a deadlock, a connection loss, a
   * transaction write conflict. A permanent failure (the append-only
   * trigger's refusal, a constraint violation) would fail identically on
   * every attempt, so retrying it only wastes the request's time and hides
   * the defect.
   */
  private async appendWithRetry(
    id: string,
    viewer: TrailViewer,
    query: string,
    filters: TrailFilters,
    resultCount: number,
    context: TrailReadContext,
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= READ_RECORD_MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.transactions.run(async (transaction) => {
          await this.recorder.record(
            {
              id,
              administratorId: viewer.userId,
              query,
              filters: describeTrailFilters(filters),
              resultCount,
              requestId: context.requestId,
            },
            transaction,
          );
        });

        return;
      } catch (error) {
        lastError = error;

        if (classifyWriteFailure(error) === 'permanent') {
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * The pre-query gate.
   *
   * A refusal is a refusal, and it happens before the database is touched, so
   * a non-administrator receives no trail content, no count, and no signal
   * that distinguishes an existing trail from a missing one.
   */
  private assertAdministrator(viewer: TrailViewer): void {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read the audit trail.');
    }
  }

  /**
   * The parent type must be one the trail can be read for.
   *
   * Validated here rather than only at the route boundary, so the invariant
   * holds for every caller — a query for an unknown parent type is refused
   * instead of silently returning nothing.
   */
  private assertParentType(parentType: string): void {
    if (!isTrailParentType(parentType)) {
      throw new ValidationError('parentType', `"${parentType}" is not a valid parent type.`);
    }
  }
}

/** The log line emitted when a read record cannot be written. */
export interface ReadFailureContext {
  readonly requestId: string;
  readonly actorId?: string;
  readonly action: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly outcome: 'error';
  /** The failure's message. Never a trail value — the read record carries none. */
  readonly error: string;
  readonly ts: string;
}

/** Re-exported for callers that only need the event type. */
export type { AuditEvent };
