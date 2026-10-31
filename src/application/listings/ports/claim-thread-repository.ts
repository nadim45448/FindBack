/**
 * The claim thread repository port — the writes a thread message makes.
 *
 * **The transaction handle is a required parameter on every method**, as it
 * is on `ClaimRepository.create`, `ClaimDecisionRepository.approve`, and
 * `AuditWriter.record`. There is no overload that opens its own
 * transaction. A message written outside the transaction that also wrote
 * the audit event would leave the two disagreeing — and the audit trail is
 * append-only with no correction path (ADR-6), so an audit record for a
 * message that was never posted is permanent.
 *
 * **The write is unconditional, and that is deliberate.** A thread message
 * has no status to guard: the thread's writability was decided *before*
 * the transaction opened, and the write itself cannot invalidate that
 * decision — the Claim's status and the report's status are the two facts
 * the writability rule reads, and neither is changed by posting a message.
 * A conditional write here would guard against a race the design does not
 * have, at the cost of a second, subtler failure mode: a write that
 * matched no row and was reported as a failure when it was actually a
 * refusal that had already been decided.
 *
 * **The id is minted by the database, once.** The message the domain
 * produces has no id; the one the repository returns has one. The
 * repository does not invent an id — the column's default does, so the id
 * cannot be supplied by a caller.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ClaimThreadMessageBody } from '@/domain/listings';

/**
 * A thread message, as it was stored.
 */
export interface StoredThreadMessage {
  readonly id: string;
  readonly claimId: string;
  readonly reportId: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly body: ClaimThreadMessageBody;
  readonly postedAt: Date;
}

/**
 * Writes a thread message.
 */
export interface ClaimThreadRepository {
  /**
   * Insert a message into a Claim's thread.
   *
   * **The body is written as its trimmed text.** The domain trimmed it
   * before it measured it, and the write stores what the domain measured —
   * so the row holds exactly the text a reader will see.
   *
   * @returns the stored message, with the id the database minted.
   */
  postMessage(
    input: {
      readonly claimId: string;
      readonly reportId: string;
      readonly authorId: string;
      readonly authorDisplayName: string;
      readonly body: ClaimThreadMessageBody;
      readonly postedAt: Date;
    },
    transaction: TransactionHandle,
  ): Promise<StoredThreadMessage>;
}
