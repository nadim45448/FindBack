/**
 * The queue reader — the port behind the four operational queues.
 *
 * ## The reader takes a **filter**, never a viewer
 *
 * The same discipline bolt `006` applied to the visibility readers: the
 * authorisation decision is resolved *upstream* of the query, so the query
 * can be shaped by it. A reader that took the viewer would have to re-decide
 * the authorisation inside the query, and the two decisions would drift.
 *
 * ## The filter is the queue's membership rule
 *
 * The filter comes from the domain's `OPERATIONAL_QUEUE_FILTERS`, so the
 * queue's rows and the dashboard's count are **the same question asked
 * twice**. That is what makes "the count matches the number of rows the
 * queue returns" structural rather than aspirational.
 *
 * ## The reader returns rows *and* a count, and they cannot disagree
 *
 * The count is derived from the rows the reader returns, not from a second
 * query — a `COUNT(*)` beside a `SELECT` could disagree with it under a
 * concurrent write, and the dashboard's tile would then point at work that
 * is not there.
 *
 * Pure — no I/O, no framework imports.
 */

import type { QueueFilter } from '@/domain/administration';

/**
 * A pending-registration row — §15.2's columns.
 *
 * **Name, email, self-declared role, registration timestamp, and the
 * action.** The action is a control, not a column, so it is not part of
 * the row.
 */
export interface PendingRegistrationRow {
  readonly accountId: string;
  readonly displayName: string;
  readonly email: string;
  readonly selfDeclaredRole: string;
  readonly registeredAt: Date;
}

/**
 * A pending-Claim row — §15.3's columns.
 *
 * **Claim ID, item name, claimant display name, submission time.** The
 * item name is a link to the item; the claim id is the link to the review
 * screen.
 */
export interface PendingClaimRow {
  readonly claimId: string;
  readonly reportId: string;
  readonly itemName: string;
  readonly claimantDisplayName: string;
  readonly submittedAt: Date;
}

/**
 * An items-awaiting-return row — §15.4's columns.
 *
 * **Item name, claimant name, approval time.** The claimant is the
 * *approved* claimant — the one who may receive the item.
 */
export interface AwaitingReturnRow {
  readonly reportId: string;
  readonly itemName: string;
  readonly claimantName: string;
  readonly approvedAt: Date;
}

/**
 * An items-in-verification row — §15.5's columns.
 *
 * **Lost report name, Lost-report owner, currently selected responder,
 * verification started at.**
 */
export interface VerificationRow {
  readonly reportId: string;
  readonly reportName: string;
  readonly ownerDisplayName: string;
  /**
   * The owner's account id.
   *
   * **The determination names the owner, not the administrator.** FR-45
   * says the Lost report's owner determines whether a candidate is their
   * item, and the determination endpoint carries the owner's id. The
   * display name is for the administrator's eye; this is for the request.
   */
  readonly ownerUserId: string;
  readonly selectedResponderDisplayName: string | null;
  readonly verificationStartedAt: Date | null;
}

/**
 * The union of the four queues' row shapes.
 *
 * **A discriminated union, not a single wide row.** A queue that returned
 * the union's members would expose fields from the other queues, and the
 * queue's own shape is part of its contract.
 */
export type QueueRow =
  | ({ readonly kind: 'PendingRegistration' } & PendingRegistrationRow)
  | ({ readonly kind: 'PendingClaim' } & PendingClaimRow)
  | ({ readonly kind: 'AwaitingReturn' } & AwaitingReturnRow)
  | ({ readonly kind: 'Verification' } & VerificationRow);

/**
 * A queue's rows, and the count derived from them.
 */
export interface QueuePage {
  readonly rows: readonly QueueRow[];
  readonly count: number;
}

/**
 * Reads the four operational queues.
 */
export interface QueueReader {
  /**
   * Read a queue's rows under a filter.
   *
   * @param filter the queue's membership rule, from the domain.
   * @param limit the page size.
   */
  read(filter: QueueFilter, limit: number): Promise<QueuePage>;
}
