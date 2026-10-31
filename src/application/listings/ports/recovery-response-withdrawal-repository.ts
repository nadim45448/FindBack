/**
 * The Recovery Response withdrawal port — the writes FR-40's responder exit
 * needs.
 *
 * **The withdrawal is the responder's own exit, and it is narrow.** It is
 * permitted only while the response is untouched `Submitted` and unselected.
 * Once the owner has selected it, the decision belongs to the owner and the
 * administrator, not to the responder.
 *
 * **The write is conditional on the response still being `Submitted`.** The
 * responder's read and the write are two moments, and between them the owner
 * may have selected the response — at which point the withdrawal is no longer
 * permitted, and a write that landed anyway would move a response the
 * responder no longer owns the decision about. The conditional write is what
 * makes the refusal hold under a race; the domain's rule is the
 * user-facing half, and this is the fact.
 *
 * **The transaction handle is a required parameter**, exactly as
 * `ClaimRepository.create` and `AuditWriter.record` do. There is no overload
 * that opens its own transaction. A response written outside the transaction
 * that also wrote its audit event would leave the two disagreeing — and the
 * audit trail is append-only with no correction path (ADR-6), so an audit
 * record for a withdrawal that did not happen is permanent.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { RecoveryResponseStatus } from '@/domain/recovery';

/** The facts about one response that the withdrawal needs. */
export interface RecoveryResponseWithdrawalFacts {
  /** The response's id. */
  readonly recoveryResponseId: string;
  /** The Lost report the response belongs to. */
  readonly lostReportId: string;
  /** The response's status. */
  readonly status: RecoveryResponseStatus;
  /** The member who made the response. */
  readonly responderId: string;
}

/** Reads the facts a withdrawal needs, and performs the write. */
export interface RecoveryResponseWithdrawalRepository {
  /**
   * Read one response's withdrawal facts.
   *
   * @returns the facts, or `null` when no response carries that id.
   */
  readWithdrawalFacts(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseWithdrawalFacts | null>;

  /**
   * Move a response to `Withdrawn`.
   *
   * **The write is conditional on the response still being `Submitted`.** A
   * response that was selected or decided between the caller's read and this
   * write is not withdrawn — the write lands nothing.
   *
   * @returns `true` when the write landed, `false` when it did not.
   */
  withdraw(
    responseId: string,
    transaction: TransactionHandle,
  ): Promise<boolean>;
}
