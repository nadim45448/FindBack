/**
 * The Lost report subject reader — the facts the Lost-side workflow needs
 * about the report it acts on.
 *
 * **A separate port, because the report repository reads a `Report` and the
 * Lost-side workflow needs the report's *owner* and *type* as facts.** Both
 * are on the report row, but the shape the workflow reasons about is
 * different: it needs to know that the report is a **Lost** report, that its
 * owner is the member making the selection, and that the report is in a
 * status this machine owns.
 *
 * **The write is here too,** because the report's lifecycle move is a
 * *status* change and nothing else — the same shape as the withdrawal's
 * `{ status: 'Closed' }` update that the report repository already accepts.
 *
 * **The transaction handle is a required parameter for the write.** A
 * report moved outside the transaction that also writes its audit events
 * would leave the two disagreeing, and the audit trail is append-only with
 * no correction path (ADR-6).
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ReportStatus } from '@/domain/listings';

/** The Lost report the workflow acts on. */
export interface LostReportSubject {
  readonly id: string;
  /** The report's type. Always `Lost` for a subject read from this port. */
  readonly type: 'Lost';
  /** The report's lifecycle status. */
  readonly status: ReportStatus;
  /** The report's owner — the member who lost the item. */
  readonly reporterId: string;
  /** The report's name, for the notification and the audit context. */
  readonly name: string;
  /** When the action being performed occurred. */
  readonly occurredAt: Date;
}

/** Reads the Lost reports the workflow acts on. */
export interface LostReportSubjectReader {
  /**
   * Read a Lost report with the facts the workflow needs.
   *
   * @returns the subject, or `null` when no report carries that id. **A
   * report that is not a Lost report is also `null`** — this port reads
   * Lost reports, and a Found report is not one.
   */
  readLostReport(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<LostReportSubject | null>;

  /**
   * Move the Lost report to `Verification Pending`.
   *
   * **The move is conditional on the report being `Open`,** so two owners
   * selecting concurrently cannot both move the report — and the report's
   * status is the fact that settles which selection won.
   *
   * @returns `true` when the move landed, `false` when the report was no
   * longer `Open`.
   */
  moveToVerificationPending(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<boolean>;

  /**
   * Move the Lost report to `Open`.
   *
   * **The move is conditional on the report being `Verification Pending`,**
   * so a report that has already left that status is not moved again. This
   * is the return leg of the `Not a Match` determination — the owner has
   * decided the response was not their item, so the search reopens.
   *
   * @returns `true` when the move landed, `false` when the report was no
   * longer `Verification Pending`.
   */
  moveToOpen(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<boolean>;
}
