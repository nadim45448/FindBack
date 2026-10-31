/**
 * The Recovery Response reader port — the facts the submission gate needs
 * about a report's existing responses.
 *
 * **It answers two questions about a report's responses:**
 *
 * 1. **Does the selected response on this report have reached `Match
 *    Confirmed`?** That is FR-40's cutoff, asked from the user's side — the
 *    domain decides whether a submission is refused, and this port supplies
 *    the fact it decides on.
 * 2. **Does this responder already hold a non-terminal Response on this
 *    report?** That is FR-40's one-live-response-per-responder rule.
 *
 * **Both questions are asked of the response table, and neither is answered
 * by the report.** The report carries its own status; the responses carry
 * their own, and the two are different state machines that must never share a
 * vocabulary.
 *
 * **The live-response rule is a partial unique index as well as this
 * check.** The claim-side sibling says explicitly that the database is the
 * fact and the application check is the explanation, because the check alone
 * cannot survive two simultaneous submissions. The same holds here.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** Reads the facts about a report's Recovery Responses. */
export interface RecoveryResponseReader {
  /**
   * Whether the selected response on the report has reached `Match
   * Confirmed`.
   *
   * @returns `false` when no response is selected, or when the selected
   * response has not yet been confirmed. **Only a confirmed match is `true`** —
   * an unreadable selected state is not a confirmation.
   */
  hasMatchConfirmed(reportId: string, transaction?: TransactionHandle): Promise<boolean>;

  /**
   * Whether the responder already holds a **non-terminal** Response on the
   * report.
   *
   * @returns `true` when the responder holds a `Submitted`, `Selected for
   * Verification`, or `Match Confirmed` Response on this report. A terminal
   * Response does **not** count — a responder whose response was `Not a
   * Match` may respond again, and that new Response sits alongside the
   * retained history.
   */
  hasLiveResponse(
    reportId: string,
    responderId: string,
    transaction?: TransactionHandle,
  ): Promise<boolean>;
}
