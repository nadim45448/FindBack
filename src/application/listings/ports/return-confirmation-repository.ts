/**
 * The return-confirmation repository port — the writes a Returned confirmation
 * makes.
 *
 * **The transaction handle is a required parameter on every method**, as it
 * is on `AuditWriter.record` and `ClaimDecisionRepository.approve`. There is
 * no overload that opens its own transaction. A confirmation that wrote the
 * report's status outside the transaction that also wrote the audit event
 * would leave the two disagreeing — and the audit trail is append-only with
 * no correction path (ADR-6), so that error would be permanent.
 *
 * **The report's move is a conditional write.** A report may be confirmed
 * Returned only from its direction's precondition status, so the write says
 * so in its `WHERE` clause rather than relying on the reader's earlier
 * check. The reader's check is **advisory** — it lets the service refuse
 * without opening a transaction — but it cannot be the guarantee, because
 * between the read and the write another administrator may confirm the same
 * report.
 *
 * **A write that matched no row is a conflict, not a silent success.** The
 * port returns whether the write landed, and the service turns "did not
 * land" into the conflict the story requires: *"two administrators confirm
 * Returned on the same report concurrently… exactly one commits and the
 * other receives a conflict."*
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ReportType } from '@/domain/listings';
import type { SubstituteReceiver } from '@/domain/returns';

/**
 * The confirmation row as it is written.
 *
 * **The receiver is one of two shapes, and the row records which.** A default
 * receiver is an account id; a substitute is a name plus an authorization plus
 * a relationship. The row carries the *default* receiver's account id
 * whenever one exists — because the authorization is the default receiver's,
 * and the trail must be able to say whose consent it was.
 */
export interface ReturnConfirmationWrite {
  readonly reportId: string;
  readonly reportType: ReportType;
  /** The confirming administrator. */
  readonly administratorId: string;
  /** The default receiver's account id. */
  readonly defaultReceiverAccountId: string;
  /** The substitute, or `null` when the default receiver received the item. */
  readonly substitute: SubstituteReceiver | null;
  /** When the confirmation happened. */
  readonly confirmedAt: Date;
}

/**
 * Writes and reads Returned confirmations.
 */
export interface ReturnConfirmationRepository {
  /**
   * Move the report to `Returned` and record the confirmation.
   *
   * **The move is conditional on the report still being in its direction's
   * precondition status,** so two administrators confirming concurrently
   * cannot both move the report — the report's status is the fact that
   * settles which confirmation won.
   *
   * @returns the confirmation's id when it landed, or `null` when the
   * report was no longer in its precondition status.
   */
  confirmReturned(
    confirmation: ReturnConfirmationWrite,
    transaction: TransactionHandle,
  ): Promise<string | null>;

  /**
   * Read the confirmation recorded against a report.
   *
   * @returns the confirmation, or `null` when no confirmation carries that
   * report id.
   */
  findByReportId(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<StoredReturnConfirmation | null>;
}

/** The confirmation as it is stored. */
export interface StoredReturnConfirmation {
  readonly id: string;
  readonly reportId: string;
  readonly reportType: ReportType;
  /** The default receiver's account id. */
  readonly defaultReceiverAccountId: string;
  /** The substitute's name, or `null` when the default receiver received it. */
  readonly substituteReceiverName: string | null;
  /** The authorization affirmation, or `null`. */
  readonly authorizationAffirmation: string | null;
  /** The relationship, or `null`. */
  readonly relationship: string | null;
  readonly administratorId: string;
  readonly confirmedAt: Date;
}
