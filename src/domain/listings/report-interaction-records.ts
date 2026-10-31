/**
 * The dependent records a lifecycle change may have to resolve.
 *
 * **The withdrawal's side effects are on records this module does not own.**
 * When a reporter withdraws a Found report, every Pending Claim on it
 * transitions to `Rejected` (FR-11). When a reporter withdraws a Lost
 * report, every non-terminal Recovery Response transitions to
 * `Resolved — Report Closed` (FR-11). Those records live in other modules,
 * and this module must be able to *resolve* them without knowing how they
 * are stored.
 *
 * **The domain names the outcome, not the mechanism.** A record is named by
 * its id, its current status, and — where the rule needs it — the identity of
 * the person who must be notified. The port returns those facts; the
 * application layer issues the writes through a separate command port.
 *
 * **A `Pending` Claim is identified by its status, not by a flag.** The Claim
 * status vocabulary is the PRD's (FR-41): `Pending`, `Approved`, `Rejected`,
 * `Returned`. A Claim that has been decided is not Pending, and the
 * withdrawal must not touch it — Claim history is preserved.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * A Claim's status. The PRD's literals, verbatim.
 *
 * **Re-exported from `claim-status.ts`,** which owns the vocabulary. This
 * module reasons about a Claim's status to decide what a report withdrawal
 * must resolve, and the Claim aggregate states a Claim's own status — so
 * there is one vocabulary, not two. The same reasoning the Recovery Response
 * status gets two lines below.
 */
export type { ClaimStatus } from './claim-status';

import type { ClaimStatus } from './claim-status';

/**
 * A Recovery Response's status. The PRD's literals, verbatim (FR-41).
 *
 * **Re-exported from the `recovery` domain module,** which owns the
 * vocabulary. This module reasons about a response's status to decide what a
 * report withdrawal must resolve, and the Lost-side workflow decides the
 * same fact to decide what a transition permits — so there is one
 * vocabulary, not two.
 */
export type { RecoveryResponseStatus } from '@/domain/recovery/recovery-response-status';

import type { RecoveryResponseStatus } from '@/domain/recovery/recovery-response-status';

/**
 * A Pending Claim that a withdrawal must reject.
 *
 * **The claimant's email is carried here** because FR-11 requires the
 * FR-29 claim-rejection email to reach every affected claimant. The
 * notification is a consequence of the transition, so the identity needed to
 * send it travels with the record — the application layer does not have to
 * re-read the claimant to find out where to send the message.
 */
export interface PendingClaimToReject {
  readonly claimId: string;
  readonly claimStatus: ClaimStatus;
  /** The claimant's email address, for the FR-29 notification. */
  readonly claimantEmail: string;
}

/**
 * A non-terminal Recovery Response that a withdrawal must resolve.
 *
 * **The responder's email is not carried here**, because FR-11 and FR-30 say
 * no closure email is sent to responders on a Lost-side withdrawal. Carrying
 * it would invite a notification that the PRD forbids.
 */
export interface WithdrawalResolvedRecoveryResponse {
  readonly recoveryResponseId: string;
  readonly recoveryResponseStatus: RecoveryResponseStatus;
}

/**
 * The Recovery Response statuses that a report withdrawal resolves.
 *
 * **This is the withdrawal's resolve set, not the canonical non-terminal
 * set**, and the difference is worth stating precisely.
 *
 * `Match Confirmed` is **non-terminal** — it is one of the three statuses a
 * response may still leave (FR-41), and the canonical
 * `NON_TERMINAL_RECOVERY_RESPONSE_STATUSES` includes it. But a report
 * withdrawal is **blocked outright** once a `Match Confirmed` response
 * exists, and the block is decided separately, from the interaction facts
 * (`hasMatchConfirmed`). So no `Match Confirmed` response is ever reached by
 * the resolve step: the withdrawal is refused before it.
 *
 * The two terminal resolved statuses are absent because a withdrawal that
 * resolved an already-resolved response would write a history event for a
 * transition that did not happen.
 *
 * **The set is named for what it does, not for the canonical vocabulary's
 * shape.** Calling it "non-terminal" would have been a second answer to
 * "which statuses are non-terminal?", and it would have been wrong.
 */
export const WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES: readonly RecoveryResponseStatus[] =
  Object.freeze(['Submitted', 'Selected for Verification']);

/**
 * True when a withdrawal would resolve a response in this status.
 *
 * **The predicate is named for the withdrawal, not for terminality** — for
 * the same reason the constant is.
 */
export function isResolvedByReportWithdrawal(
  status: RecoveryResponseStatus,
): boolean {
  return WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES.includes(status);
}

/** The audit reason FR-11 records for a Claim auto-rejected by withdrawal. */
export const WITHDRAWAL_CLAIM_REJECTION_REASON = 'report withdrawn by reporter';

/**
 * The status a Claim takes when a withdrawal rejects it.
 *
 * **Re-exported from `claim-status.ts`,** which owns the vocabulary, for the
 * same reason the type above is.
 */
export { CLAIM_REJECTED_STATUS } from './claim-status';

/** The status a Recovery Response takes when a withdrawal resolves it. */
export const RECOVERY_RESPONSE_RESOLVED_CLOSED_STATUS: RecoveryResponseStatus =
  'Resolved — Report Closed';
