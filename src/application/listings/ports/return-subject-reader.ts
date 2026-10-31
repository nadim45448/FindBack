/**
 * The return-subject reader — the facts a Returned confirmation needs about
 * the report it acts on.
 *
 * **A separate port, because the confirmation needs the report's *type*, its
 * *status*, and its *owner* as facts — and the owner matters differently in
 * each direction.** A Found report's default receiver is the approved
 * claimant; a Lost report's is the owner. The report repository reads a
 * `Report`, which carries all of them, but the shape the confirmation reasons
 * about is different, and a reader that answers "who is the default receiver
 * for this report?" in one call keeps the direction's rule in one place.
 *
 * **The reader filters the direction in the query, not in TypeScript.** The
 * port reads reports *for a return confirmation*, and the row never reaches
 * the application layer unless it could be confirmed at all — so the
 * Sensitive Fields are not selected and cannot leak into the audit payload
 * or an email.
 *
 * **The approved claimant is read here, and only here.** It lives on the
 * `claims` table, and a Found report's default receiver is the claimant on
 * its approved Claim. The reader resolves it, so the derivation in the
 * domain receives a plain id rather than a Claim row it would have to
 * understand.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ReportStatus, ReportType } from '@/domain/listings';

/** The report a return confirmation acts on. */
export interface ReturnSubject {
  readonly id: string;
  readonly type: ReportType;
  readonly status: ReportStatus;
  /** The report's owner — the member who created it. */
  readonly reporterId: string;
  /**
   * The claimant on the report's approved Claim.
   *
   * **`null` for a Lost report** — a Lost report has no Claims at all — and
   * **`null` for a Found report with no approved Claim.**
   */
  readonly approvedClaimantId: string | null;
}

/**
 * Reads the reports a return confirmation acts on.
 */
export interface ReturnSubjectReader {
  /**
   * Read the report a return confirmation acts on.
   *
   * @returns the subject, or `null` when no report carries that id.
   */
  readReturnSubject(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<ReturnSubject | null>;
}
