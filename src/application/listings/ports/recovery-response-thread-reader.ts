/**
 * The Recovery Response thread reader port.
 *
 * **It answers the questions the thread needs, and nothing more.** The
 * thread's gate reads the Response's status, the report's status, the two
 * participants' ids; the thread's history is read as messages. Those are the
 * two questions, and the port answers exactly them.
 *
 * **The gate's read is a single query, and it is one query because the facts
 * must agree.** A Response's status, the report's status, the responder's id,
 * and the report owner's id are four facts about one item. Reading them
 * separately would be four snapshots, and a thread gate that read a
 * `Submitted` Response and then a `Closed` report would be a gate that read a
 * state that never existed.
 *
 * **The reader carries no Sensitive Field.** The Response's where-found, its
 * observed identifying details, and its date found are FR-44's fields and
 * FR-37's Sensitive Fields — and a responder must not see the owner's
 * private evidence (FR-39). There is no field on the subject for them, which
 * is how "participation grants no private evidence" is made structural rather
 * than promised.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ReportStatus } from '@/domain/listings';
import type { RecoveryResponseStatus } from '@/domain/recovery';

/**
 * The facts a thread gate reads.
 *
 * **The Response's status and the report's status are separate fields, not
 * one merged "is it over" flag.** They are different facts about the item,
 * and the read-only reason a locked thread reports depends on which one
 * closed it — `ResponseEnded` and `ReportEnded` are distinct.
 */
export interface RecoveryResponseThreadSubject {
  readonly recoveryResponseId: string;
  /** The Lost report the Response was made against. */
  readonly lostReportId: string;
  /** The Recovery Response's status. */
  readonly responseStatus: RecoveryResponseStatus;
  /** The Lost report's status. */
  readonly reportStatus: ReportStatus;
  /** The member who made this response. */
  readonly responderId: string;
  /** The owner of the Lost report the response belongs to. */
  readonly lostReportOwnerId: string;
}

/**
 * A thread message, as read for display.
 */
export interface RecoveryResponseThreadMessageView {
  readonly id: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly body: string;
  readonly postedAt: string;
}

/**
 * Reads the facts a Recovery Response thread needs.
 */
export interface RecoveryResponseThreadReader {
  /**
   * Read the Recovery Response's thread subject.
   *
   * @returns the subject, or `null` when no Recovery Response carries that id.
   */
  readThreadSubject(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseThreadSubject | null>;

  /**
   * Read the Recovery Response's thread, oldest message first.
   *
   * **A thread with no messages is an empty thread, not a missing one.** The
   * read returns an empty list rather than `null`; a thread exists from the
   * moment its Response does.
   */
  listThreadMessages(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<readonly RecoveryResponseThreadMessageView[]>;

  /**
   * Read the posting member's own account facts.
   *
   * **The display name is captured, not joined at read time.** The name on a
   * message is a record of who spoke when it was posted, so it is written
   * onto the message and never re-read. The read here exists only to capture
   * it at the moment of posting.
   *
   * @returns the account's display name, or `null` when no account carries
   * that id.
   */
  readAuthorDisplayName(
    authorId: string,
    transaction?: TransactionHandle,
  ): Promise<string | null>;
}
