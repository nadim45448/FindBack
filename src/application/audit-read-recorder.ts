/**
 * Records a read of the audit trail.
 *
 * A read is accountable: PRD §10 requires that audit-trail reads are
 * themselves logged, and the record goes to the database because Vercel Hobby
 * retains runtime logs for only one hour.
 *
 * A read is a **distinct record type**, not an event on the audited entity.
 * Recording it in the trail would recurse without adding accountability.
 *
 * **This component performs one insert attempt.** The retry policy lives in
 * `AuditTrailService`, which owns the loop and opens a **fresh transaction**
 * for each attempt — a failed statement aborts its PostgreSQL transaction, so
 * retrying inside the aborted one could never succeed.
 */

import type { AuditReadLog, AuditReadLogRepository } from './ports/audit-read-log-repository';
import type { TransactionHandle } from './ports/transaction-handle';

/** A draft of a trail read. */
export interface AuditReadDraft {
  /**
   * The record's id.
   *
   * A caller that may retry supplies it, so that every attempt writes the
   * **same** id. Because `audit_read_logs.id` is the primary key, a duplicate
   * insert is refused by the database rather than creating a second row — so
   * the retry is idempotent by construction and never produces two records
   * for one read (ADR-7).
   *
   * A single-shot caller may omit it, and one is generated.
   */
  readonly id?: string;
  readonly administratorId: string;
  readonly query?: string | null;
  readonly filters?: unknown;
  readonly resultCount: number;
  readonly requestId?: string | null;
  readonly readAt?: Date;
}

/** Records trail reads. */
export class AuditReadRecorder {
  constructor(private readonly reads: AuditReadLogRepository) {}

  /**
   * Record one trail read inside the caller's transaction.
   *
   * @throws {AuditWriteOutsideTransactionError} when the handle is missing.
   */
  async record(draft: AuditReadDraft, transaction: TransactionHandle): Promise<AuditReadLog> {
    if (!transaction || typeof transaction !== 'object' || !('transaction' in transaction)) {
      throw new Error(
        'An audit read must be recorded inside the caller transaction that performed the read.',
      );
    }

    const readAt = draft.readAt ?? new Date();

    return this.reads.append(
      {
        id: draft.id ?? crypto.randomUUID(),
        administratorId: draft.administratorId,
        query: draft.query ?? null,
        filters: draft.filters ?? null,
        resultCount: draft.resultCount,
        requestId: draft.requestId ?? null,
        readAt,
        createdAt: readAt,
      },
      transaction,
    );
  }
}
