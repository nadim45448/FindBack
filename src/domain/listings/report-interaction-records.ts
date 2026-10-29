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

/** A Claim's status. The PRD's literals, verbatim. */
export type ClaimStatus = 'Pending' | 'Approved' | 'Rejected' | 'Returned';

/**
 * A Recovery Response's status. The PRD's literals, verbatim (FR-41).
 *
 * **The whole vocabulary is listed, not only the ones this module reasons
 * about.** A withdrawal resolves `Submitted` and `Selected for Verification`
 * and is blocked by `Match Confirmed`; the other five belong to Units 003 and
 * 004. But the type is the record's status, and a type that named only some
 * of the values the database accepts would make a legitimate row
 * unrepresentable — so the vocabulary is complete here, and
 * `NON_TERMINAL_RECOVERY_RESPONSE_STATUSES` is what narrows it.
 */
export type RecoveryResponseStatus =
  | 'Submitted'
  | 'Selected for Verification'
  | 'Match Confirmed'
  | 'Not a Match'
  | 'Completed — Report Returned'
  | 'Resolved — Report Returned'
  | 'Resolved — Report Closed'
  | 'Withdrawn';

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
export interface NonTerminalRecoveryResponseToResolve {
  readonly recoveryResponseId: string;
  readonly recoveryResponseStatus: RecoveryResponseStatus;
}

/**
 * The Recovery Response statuses that a withdrawal resolves.
 *
 * **Every non-terminal status is listed, and every terminal one is absent.**
 * `Match Confirmed` is terminal for this purpose — a withdrawal is blocked
 * outright once Match Confirmed is recorded — and `Resolved — Report
 * Returned` / `Resolved — Report Closed` are already resolved. A withdrawal
 * that resolved an already-resolved response would write a history event for
 * a transition that did not happen.
 */
export const NON_TERMINAL_RECOVERY_RESPONSE_STATUSES: readonly RecoveryResponseStatus[] =
  Object.freeze(['Submitted', 'Selected for Verification']);

/** True when `status` is a Recovery Response status a withdrawal resolves. */
export function isNonTerminalRecoveryResponseStatus(
  status: RecoveryResponseStatus,
): boolean {
  return NON_TERMINAL_RECOVERY_RESPONSE_STATUSES.includes(status);
}

/** The audit reason FR-11 records for a Claim auto-rejected by withdrawal. */
export const WITHDRAWAL_CLAIM_REJECTION_REASON = 'report withdrawn by reporter';

/** The status a Claim takes when a withdrawal rejects it. */
export const CLAIM_REJECTED_STATUS: ClaimStatus = 'Rejected';

/** The status a Recovery Response takes when a withdrawal resolves it. */
export const RECOVERY_RESPONSE_RESOLVED_CLOSED_STATUS: RecoveryResponseStatus =
  'Resolved — Report Closed';
