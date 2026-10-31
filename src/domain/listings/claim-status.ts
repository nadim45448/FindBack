/**
 * The Claim's status — the PRD's vocabulary, verbatim (FR-41).
 *
 * **`Pending`, `Approved`, `Rejected`, `Returned`.** Four statuses, not
 * three. `Returned` is a real Claim status: FR-17's "another claim was
 * approved for this item" auto-rejects the losing Claims, and FR-11's
 * withdrawal auto-rejects the Pending ones — and a Claim that was returned
 * to its owner is a distinct end state from a Claim that was refused.
 *
 * **This module is the single implementation point for that vocabulary.**
 * It used to live inside `report-interaction-records.ts`, which needed it
 * only to resolve a withdrawal's dependent Claims. The Claim aggregate now
 * needs it too — to state a Claim's own status — and a second declaration of
 * the same four literals in two modules is two vocabularies the day one of
 * them is changed. The type now lives here, and that module re-exports it.
 *
 * **The literals are the PRD's, verbatim** (coding-standards § Naming
 * conventions: "Status literals are named after the PRD, verbatim"). They are
 * never renamed.
 *
 * **This bolt writes only `Pending`.** The administrator's approve and reject
 * belong to bolt `016-claim-decisions`. The statuses are modelled **now**
 * because the `claims.status` column carries a CHECK constraint over the
 * whole set, and a constraint over a partial set would have to be altered
 * the moment the machine grows — the same reasoning `report-status.ts`
 * records.
 *
 * **A Claim's status is not a Recovery Response status.** The Found side's
 * Claim and the Lost side's Recovery Response are different aggregates with
 * different vocabularies; story 001's technical note is explicit that no
 * Recovery Response state may be referenced or reused here.
 *
 * Pure — no I/O, no framework imports.
 */

/** A Claim's status. */
export type ClaimStatus = 'Pending' | 'Approved' | 'Rejected' | 'Returned';

/** Every Claim status, in lifecycle order. */
export const CLAIM_STATUSES: readonly ClaimStatus[] = Object.freeze([
  'Pending',
  'Approved',
  'Rejected',
  'Returned',
]);

/** True when `status` is one of the canonical Claim statuses. */
export function isClaimStatus(value: string): value is ClaimStatus {
  return (CLAIM_STATUSES as readonly string[]).includes(value);
}

/**
 * The statuses a Claim can never leave.
 *
 * `Approved`, `Rejected`, and `Returned` are terminal: a decided Claim is
 * decided, and Claim history is preserved (FR-17).
 */
export const TERMINAL_CLAIM_STATUSES: readonly ClaimStatus[] = Object.freeze([
  'Approved',
  'Rejected',
  'Returned',
]);

/** True when the status accepts no further change. */
export function isTerminalClaimStatus(status: ClaimStatus): boolean {
  return TERMINAL_CLAIM_STATUSES.includes(status);
}

/** The status a Claim takes when a withdrawal rejects it. */
export const CLAIM_REJECTED_STATUS: ClaimStatus = 'Rejected';

/**
 * The status a Claim takes when an administrator approves it.
 *
 * **The counterpart to `CLAIM_REJECTED_STATUS`,** and named for the same
 * reason: the two decisions are the two outcomes of the administrator's
 * review, and a caller that wrote `'Approved'` inline would be writing a
 * second answer to "what does an approved Claim look like?".
 */
export const CLAIM_APPROVED_STATUS: ClaimStatus = 'Approved';

/**
 * The status a Claim takes when it is submitted and awaiting a decision.
 *
 * **The only non-terminal Claim status.** A Claim is `Pending` until an
 * administrator decides it, and the decision is what ends it.
 */
export const CLAIM_PENDING_STATUS: ClaimStatus = 'Pending';
