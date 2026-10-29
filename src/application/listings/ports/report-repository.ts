/**
 * The report repository port.
 *
 * **The transaction handle is a required parameter**, exactly as
 * `AuditWriter.record` does. There is no overload that opens its own
 * transaction. A report written outside the transaction that also writes its
 * audit event would produce an audit record for a report that may not exist —
 * and the audit trail is append-only with no correction path (ADR-6), so that
 * error is permanent.
 */

import type { PersistedReport, ValidatedReport } from '@/domain/listings';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** Writes reports. */
export interface ReportRepository {
  /**
   * Insert a report inside the caller's transaction.
   *
   * The report arrives **without an id**: the id is minted here, once, so it
   * cannot be supplied by a caller or invented by the domain. The returned
   * report carries it.
   */
  create(report: ValidatedReport, transaction: TransactionHandle): Promise<PersistedReport>;
}
