/**
 * The Lost-report closeout reader — the facts a Lost-side closeout or
 * closure needs about the report it acts on.
 *
 * **A separate port, because the Lost side's closeout needs a different
 * shape of report than the Found side's close.** The Found-side close
 * (`report-close-service.ts`) needs a `Found` report's Claims; the Lost-side
 * closeout needs a `Lost` report's **responses** and its owner, and the
 * owner matters here in a way it does not there — the owner is the default
 * receiver and event 7's recipient.
 *
 * **The responses are read here, and the set is complete.** The closeout
 * decides which response is matched and which are resolved, and it can only
 * do that from the full set. The reader returns every response with its
 * status — not just the live ones — because *which* responses are left
 * alone is as much a part of the decision as which are resolved.
 *
 * **The responder's email address is read here too,** because the
 * notifications that fire with the closeout must reach the matched
 * responder, and an address read after the fact could be the wrong one if
 * the response set had changed. It travels with the response.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { RecoveryResponseStatus } from '@/domain/recovery';

/** A Recovery Response as the closeout reader sees it. */
export interface CloseoutResponseRecord {
  readonly id: string;
  readonly status: RecoveryResponseStatus;
  /** The responder's email address — event 8's recipient. */
  readonly responderEmail: string;
}

/** The Lost report a closeout acts on. */
export interface LostCloseoutSubject {
  readonly id: string;
  readonly status: string;
  /**
   * The report's name — the item's name.
   *
   * **The only member-supplied string the closeout carries,** and it goes
   * into the notification bodies. It is escaped by the builders, so a name
   * carrying markup does not become markup in an email.
   */
  readonly name: string;
  /** The report's owner — the default receiver and event 7's recipient. */
  readonly ownerId: string;
  /** The owner's email address — event 7's recipient. */
  readonly ownerEmail: string;
  /** Every response on the report, with its status. */
  readonly responses: readonly CloseoutResponseRecord[];
  /**
   * The response the owner selected for verification.
   *
   * **`null` when no response is selected.** The closeout names the matched
   * response explicitly, and this is where that name comes from — read from
   * the database, never asserted by a client.
   */
  readonly selectedResponseId: string | null;
}

/**
 * Reads the reports a Lost-side closeout acts on.
 */
export interface LostReportCloseoutReader {
  /**
   * Read the Lost report a closeout acts on.
   *
   * @returns the subject, or `null` when no report carries that id.
   */
  readLostCloseoutSubject(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<LostCloseoutSubject | null>;
}
