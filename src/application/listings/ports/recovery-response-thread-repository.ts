/**
 * The Recovery Response thread repository port — the writes a thread message
 * makes.
 *
 * **The transaction handle is a required parameter on every method**, as it
 * is on `ClaimThreadRepository.postMessage`, `ClaimRepository.create`, and
 * `AuditWriter.record`. There is no overload that opens its own transaction. A
 * message written outside the transaction that also wrote the audit event
 * would leave the two disagreeing — and the audit trail is append-only with no
 * correction path (ADR-6), so an audit record for a message that was never
 * posted is permanent.
 *
 * **The write is unconditional, and that is deliberate.** A thread message
 * has no status to guard: the thread's writability was decided *before* the
 * transaction opened, and the write itself cannot invalidate that decision —
 * the Response's status and the report's status are the two facts the
 * writability rule reads, and neither is changed by posting a message. A
 * conditional write here would guard against a race the design does not have,
 * at the cost of a second, subtler failure mode: a write that matched no row
 * and was reported as a failure when it was actually a refusal that had
 * already been decided.
 *
 * **The write names the parent kind, and the kind is the isolation.** A
 * Recovery Response's thread is written with `parentType = 'recovery_response'`
 * and `parentId = <the response id>`, and the Claim column is left null. The
 * database's `thread_messages_parent_claim_consistency_check` refuses a row
 * that claims one parent kind and names the other's id — so a message can
 * never be filed under a thread it does not belong to.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { RecoveryResponseThreadMessageBody } from '@/domain/recovery';

/**
 * A thread message, as it was stored.
 */
export interface StoredRecoveryResponseThreadMessage {
  readonly id: string;
  readonly recoveryResponseId: string;
  readonly lostReportId: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly body: RecoveryResponseThreadMessageBody;
  readonly postedAt: Date;
}

/**
 * Writes a Recovery Response thread message.
 */
export interface RecoveryResponseThreadRepository {
  /**
   * Insert a message into a Recovery Response's thread.
   *
   * **The body is written as its trimmed text.** The domain trimmed it
   * before it measured it, and the write stores what the domain measured —
   * so the row holds exactly the text a reader will see.
   *
   * @returns the stored message, with the id the database minted.
   */
  postMessage(
    input: {
      readonly recoveryResponseId: string;
      readonly lostReportId: string;
      readonly authorId: string;
      readonly authorDisplayName: string;
      readonly body: RecoveryResponseThreadMessageBody;
      readonly postedAt: Date;
    },
    transaction: TransactionHandle,
  ): Promise<StoredRecoveryResponseThreadMessage>;
}
