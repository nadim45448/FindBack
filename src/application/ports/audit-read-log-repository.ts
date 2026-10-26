/**
 * The insert-only audit-read-log repository.
 *
 * A read of the trail is itself accountable (PRD §10), so it is recorded in
 * the database rather than only on stdout — Vercel Hobby retains runtime logs
 * for one hour.
 *
 * Like the event repository, there is no update or delete method.
 */

import type { TransactionHandle } from './transaction-handle';

/** The fields a read-log entry writes. */
export interface AuditReadLogRecord {
  readonly id: string;
  readonly administratorId: string;
  readonly query: string | null;
  readonly filters: unknown;
  readonly resultCount: number;
  readonly requestId: string | null;
  readonly readAt: Date;
  readonly createdAt: Date;
}

/** A recorded read of the trail. */
export interface AuditReadLog {
  readonly id: string;
  readonly administratorId: string;
  readonly query: string | null;
  readonly filters: unknown;
  readonly resultCount: number;
  readonly requestId: string | null;
  readonly readAt: Date;
}

/**
 * An insert-only repository for audit read logs.
 */
export interface AuditReadLogRepository {
  /**
   * Append one read record inside the caller's transaction.
   */
  append(read: AuditReadLogRecord, transaction: TransactionHandle): Promise<AuditReadLog>;

  /**
   * Read a page of read records for an administrator.
   *
   * The default page size is 25, matching the trail's page size. There is no
   * UX surface for the read log (`EXPERIENCE.md` §17.6 — it is a backend
   * concern), so the number is an operational convenience rather than a
   * product decision.
   */
  listByAdministrator(administratorId: string, limit?: number): Promise<readonly AuditReadLog[]>;
}
