/**
 * The claim thread reader port.
 *
 * **It answers the questions the thread needs, and nothing more.** The
 * thread's gate reads the Claim's status, the report's status, the two
 * participants' ids, and the viewer's own account facts; the thread's
 * history is read as messages. Those are the two questions, and the port
 * answers exactly them.
 *
 * **The gate's read is a single query, and it is one query because the
 * facts must agree.** A Claim's status, the report's status, the claimant's
 * id, and the report owner's id are four facts about one item. Reading
 * them separately would be four snapshots, and a thread gate that read a
 * `Pending` Claim and then a `Closed` report would be a gate that read a
 * state that never existed.
 *
 * **The email address is read here and nowhere else.** It travels with the
 * subject, from this read to the notification, and it is never put on a
 * Claim, a thread message, or an audit payload.
 *
 * **The transaction handle is optional, and only the history read uses it.**
 * The gate's read happens before the transaction opens, so that a refused
 * post writes nothing; the history read happens inside the transaction that
 * is about to write, so that the messages read are the messages the write
 * will sit among.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ClaimStatus, ReportStatus } from '@/domain/listings';

/**
 * The facts a thread gate reads.
 *
 * **The Claim's status and the report's status are separate fields, not one
 * merged "is it over" flag.** They are different facts about the item, and
 * the read-only reason a locked thread reports depends on which one closed
 * it — `ClaimDecided` and `ReportEnded` are distinct.
 */
export interface ClaimThreadSubject {
  readonly claimId: string;
  readonly reportId: string;
  /** The Claim's status. */
  readonly claimStatus: ClaimStatus;
  /** The Found report's status. */
  readonly reportStatus: ReportStatus;
  /** The member who made the Claim. */
  readonly claimantId: string;
  /** The finder — the owner of the Found report the Claim was made against. */
  readonly foundReportOwnerId: string;
  /** The claimant's email address, for the notification. */
  readonly claimantEmail: string;
}

/**
 * A thread message, as read for display.
 */
export interface ThreadMessageView {
  readonly id: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly body: string;
  readonly postedAt: string;
}

/**
 * Reads the facts a claim thread needs.
 */
export interface ClaimThreadReader {
  /**
   * Read the Claim's thread subject.
   *
   * @returns the subject, or `null` when no Claim carries that id.
   */
  readThreadSubject(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<ClaimThreadSubject | null>;

  /**
   * Read the Claim's thread, oldest message first.
   *
   * **A thread with no messages is an empty thread, not a missing one.**
   * The read returns an empty list rather than `null`; a thread exists from
   * the moment its Claim does.
   */
  listThreadMessages(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<readonly ThreadMessageView[]>;

  /**
   * Read the posting member's own account facts.
   *
   * **The display name is captured, not joined at read time.** The name on
   * a message is a record of who spoke when it was posted, so it is written
   * onto the message and never re-read. The read here exists only to
   * capture it at the moment of posting.
   *
   * @returns the account's display name, or `null` when no account carries
   * that id.
   */
  readAuthorDisplayName(
    authorId: string,
    transaction?: TransactionHandle,
  ): Promise<string | null>;
}
