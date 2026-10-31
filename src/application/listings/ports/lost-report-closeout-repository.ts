/**
 * The Lost-report closeout repository — the atomic writes of the Lost-side
 * Returned closeout and the Lost-side closure.
 *
 * **The two operations that must not be separated.**
 *
 * 1. **The Returned closeout.** The report reaches `Returned`, the matched
 *    response reaches `Completed — Report Returned`, every other
 *    non-terminal response reaches `Resolved — Report Returned`, and the
 *    threads become read-only — **in one transaction.**
 * 2. **The Closed closeout.** The report reaches `Closed` and every
 *    non-terminal response reaches `Resolved — Report Closed` — **in one
 *    transaction.**
 *
 * **The sets are the implementation's to obtain (ADR-10).** The port asks
 * for "the non-terminal responses on this report, except the matched one"
 * and the implementation returns the rows its single `UPDATE … RETURNING`
 * affected. A caller that assembled the set itself would have a
 * read-then-write race: a response created between the read and the write
 * would survive a closeout that was supposed to end it.
 *
 * **The report's move is conditional.** The closeout reads the report and
 * then writes it, and between the two another administrator may close the
 * same report. The conditional write is what makes the refusal hold under
 * that race — the domain's rule is the user-facing half, and this is the
 * fact.
 *
 * **A write that lands nothing returns `null`,** and the caller treats it as
 * the conflict it is. A boolean would collapse "landed" and "did not land"
 * into one value, and the caller could not tell a success from a lost race.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { RecoveryResponseStatus } from '@/domain/recovery';

/**
 * The status a batch of responses is moved to.
 *
 * **Only the two batch targets exist.** A single response's completion is
 * its own write — the matched response's `Completed — Report Returned` is
 * not a batch, because it is one response and it is named.
 */
export type CloseoutBatchTarget =
  | 'Resolved — Report Returned'
  | 'Resolved — Report Closed';

/** A response the batch update affected. */
export interface ResolvedResponseRecord {
  readonly id: string;
  /** The status it held immediately before the batch. */
  readonly previousStatus: RecoveryResponseStatus;
  /** The status it reached. */
  readonly status: RecoveryResponseStatus;
}

/**
 * Writes the Lost-side closeouts.
 */
export interface LostReportCloseoutRepository {
  /**
   * Move the report to `Returned`, the matched response to
   * `Completed — Report Returned`, and every other non-terminal response to
   * `Resolved — Report Returned`.
   *
   * @param matchedResponseId the response the owner selected
   * @param reportAlreadyReturned whether the report has **already** been
   * moved to `Returned` in this transaction — by the confirmation service,
   * which shares the transaction. The report's move is then skipped, and
   * only the responses' resolution happens.
   * @returns the resolved responses the batch affected, or `null` when the
   * report was no longer in its precondition status and nothing landed.
   */
  confirmLostReturned(
    reportId: string,
    matchedResponseId: string,
    reportAlreadyReturned: boolean,
    transaction: TransactionHandle,
  ): Promise<readonly ResolvedResponseRecord[] | null>;

  /**
   * Move the report to `Closed` and every non-terminal response to
   * `Resolved — Report Closed`.
   *
   * @returns the resolved responses the batch affected, or `null` when the
   * report was no longer closable and nothing landed.
   */
  closeLostReport(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<readonly ResolvedResponseRecord[] | null>;
}
