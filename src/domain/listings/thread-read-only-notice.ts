/**
 * The thread read-only notices — §13.5 and §13.5b's four variants each.
 *
 * ## Why this module exists
 *
 * The domain already decides **whether** a thread is read-only —
 * `decideClaimThreadWritability` and `decideRecoveryResponseThreadWritability`
 * — but they answer with two coarse reasons: `ClaimDecided` and
 * `ReportEnded`. §13.5 requires **four** distinct notices for the Claim
 * side, one per condition:
 *
 * - Approved: *"This thread is read-only because this claim has been
 *   approved. An administrator will arrange the handoff."*
 * - Rejected: *"This thread is read-only because this claim has been
 *   rejected."*
 * - Returned: *"This thread is read-only because the item has been
 *   returned."*
 * - Closed: *"This thread is read-only because this report has been
 *   closed."*
 *
 * §13.5 says plainly: *"Each variant ends with: 'Existing messages remain
 * available for reference, but no new messages can be posted.'"* And the
 * story's technical note adds the reason this matters: *"Each read-only
 * condition has its own named notice. A single generic read-only message
 * would fail to tell the user why the conversation stopped."*
 *
 * **So the coarse reason is not enough.** A claimant whose claim was
 * approved and a claimant whose item was returned both get
 * `ClaimDecided`/`ReportEnded` — but they must be told **different**
 * things, because the approved case has a path forward ("an administrator
 * will arrange the handoff") and the returned case does not.
 *
 * This module resolves the **exact variant** from the facts the domain
 * already reads. It does not re-decide writability: it takes the two facts
 * — the Claim's status and the report's status — and names the notice.
 *
 * ## The four Claim-side variants are disjoint
 *
 * The conditions are checked in the order §13.5 lists them, and **the
 * Claim's status is checked first.** A decided Claim (`Approved` or
 * `Rejected`) is read-only whatever the report's status; a `Pending` Claim
 * on a `Returned` or `Closed` report is read-only because the report
 * ended. So the notice is never ambiguous: exactly one condition is the
 * reason.
 *
 * ## The Lost side has four variants too
 *
 * §13.5b: Not a Match, Withdrawn, parent resolved (Returned or Closed),
 * and terminal (`Completed` / `Resolved`). The **terminal** case is checked
 * **before** the parent case, because a terminal response on a resolved
 * report has two true conditions and §13.5b's own list puts the terminal
 * notice last — but the terminal reason is the more specific one, so it
 * wins. The parent case then covers a **non-terminal** response on a
 * resolved report.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ClaimStatus } from './claim-status';
import type { ReportStatus } from './report-status';
import type { RecoveryResponseStatus } from '@/domain/recovery/recovery-response-status';

/**
 * The shared tail of every read-only notice.
 *
 * **§13.5 and §13.5b both require it, word for word.** It is one constant
 * so the two families cannot drift — and it is the sentence that tells a
 * member their history is still there, which is the difference between
 * "locked" and "gone".
 */
export const READ_ONLY_NOTICE_TAIL =
  'Existing messages remain available for reference, but no new messages can be posted.';

/**
 * The Claim-side read-only variants.
 *
 * **The four §13.5 conditions, named.**
 */
export type ClaimThreadReadOnlyVariant =
  | 'Approved'
  | 'Rejected'
  | 'Returned'
  | 'Closed';

/**
 * The facts the Claim-side notice is resolved from.
 */
export interface ClaimThreadNoticeFacts {
  readonly claimStatus: ClaimStatus;
  readonly reportStatus: ReportStatus;
}

/**
 * The Claim-side notice body for a variant.
 *
 * **The text is §13.5's, verbatim.**
 */
const CLAIM_NOTICE_BODY: Readonly<Record<ClaimThreadReadOnlyVariant, string>> = Object.freeze({
  Approved:
    'This thread is read-only because this claim has been approved. An administrator will arrange the handoff.',
  Rejected: 'This thread is read-only because this claim has been rejected.',
  Returned: 'This thread is read-only because the item has been returned.',
  Closed: 'This thread is read-only because this report has been closed.',
});

/**
 * The Claim-side read-only variant for a set of facts.
 *
 * **Returns `null` when the thread is writable** — the notice exists only
 * for a read-only thread.
 *
 * **The Claim's status is checked first.** A decided Claim is read-only
 * whatever the report's status, and §13.5's list begins with the Claim's
 * own conditions.
 *
 * @throws {Error} when the facts describe a writable thread.
 */
export function claimThreadReadOnlyVariant(
  facts: ClaimThreadNoticeFacts,
): ClaimThreadReadOnlyVariant | null {
  if (facts.claimStatus === 'Approved') {
    return 'Approved';
  }

  if (facts.claimStatus === 'Rejected') {
    return 'Rejected';
  }

  if (facts.claimStatus === 'Returned') {
    // **A `Returned` Claim is the Found report's own `Returned` status.**
    // The claim status vocabulary carries it, and the item has been handed
    // back — so the item's notice is the right one.
    return 'Returned';
  }

  if (facts.reportStatus === 'Returned') {
    return 'Returned';
  }

  if (facts.reportStatus === 'Closed') {
    return 'Closed';
  }

  return null;
}

/**
 * The full Claim-side read-only notice.
 *
 * **The variant's body, then the shared tail.**
 *
 * @throws {Error} when the facts describe a writable thread.
 */
export function claimThreadReadOnlyNotice(facts: ClaimThreadNoticeFacts): string {
  const variant = claimThreadReadOnlyVariant(facts);

  if (variant === null) {
    throw new Error('A writable thread has no read-only notice.');
  }

  return `${CLAIM_NOTICE_BODY[variant]} ${READ_ONLY_NOTICE_TAIL}`;
}

/**
 * The Lost-side read-only variants.
 *
 * **The four §13.5b conditions, named.**
 */
export type RecoveryResponseThreadReadOnlyVariant =
  | 'NotAMatch'
  | 'Withdrawn'
  | 'ParentResolved'
  | 'Terminal';

/**
 * The facts the Lost-side notice is resolved from.
 */
export interface RecoveryResponseNoticeFacts {
  readonly responseStatus: RecoveryResponseStatus;
  readonly reportStatus: ReportStatus;
}

/**
 * The Lost-side notice body for a variant.
 *
 * **The text is §13.5b's, verbatim.**
 */
const RECOVERY_RESPONSE_NOTICE_BODY: Readonly<
  Record<RecoveryResponseThreadReadOnlyVariant, string>
> = Object.freeze({
  NotAMatch: 'This thread is read-only because this response was not a match.',
  Withdrawn: 'This thread is read-only because you withdrew this response.',
  ParentResolved: 'This thread is read-only because the parent Lost report has been resolved.',
  Terminal: 'This thread is read-only because the recovery response is in a terminal state.',
});

/**
 * The terminal Lost-side statuses.
 *
 * **These are the statuses §13.5b calls terminal** — `Completed — Report
 * Returned`, `Resolved — Report Returned`, and `Resolved — Report Closed`.
 * `Not a Match` and `Withdrawn` have their own notices, so they are
 * excluded here.
 */
const TERMINAL_WITH_OWN_NOTICE: readonly RecoveryResponseStatus[] = Object.freeze([
  'Not a Match',
  'Withdrawn',
]);

/**
 * The Lost-side read-only variant for a set of facts.
 *
 * **Returns `null` when the thread is writable.**
 *
 * **The order matters, and it is §13.5b's specificity order:**
 *
 * 1. `Not a Match` — its own notice.
 * 2. `Withdrawn` — its own notice.
 * 3. A terminal status (`Completed — Report Returned`, `Resolved — Report
 *    Returned`, `Resolved — Report Closed`) — the terminal notice. This is
 *    checked **before** the parent case, because a terminal response on a
 *    resolved report has two true conditions and the terminal one is the
 *    more specific.
 * 4. A `Returned` or `Closed` parent report — the parent-resolved notice.
 *
 * **`Match Confirmed` is not in the list, and its absence is the point.**
 * It is non-terminal: the physical handoff is still pending, so the thread
 * stays writable and no notice is shown.
 */
export function recoveryResponseThreadReadOnlyVariant(
  facts: RecoveryResponseNoticeFacts,
): RecoveryResponseThreadReadOnlyVariant | null {
  if (facts.responseStatus === 'Not a Match') {
    return 'NotAMatch';
  }

  if (facts.responseStatus === 'Withdrawn') {
    return 'Withdrawn';
  }

  if (
    !TERMINAL_WITH_OWN_NOTICE.includes(facts.responseStatus) &&
    (facts.responseStatus === 'Completed — Report Returned' ||
      facts.responseStatus === 'Resolved — Report Returned' ||
      facts.responseStatus === 'Resolved — Report Closed')
  ) {
    return 'Terminal';
  }

  if (facts.reportStatus === 'Returned' || facts.reportStatus === 'Closed') {
    return 'ParentResolved';
  }

  return null;
}

/**
 * The full Lost-side read-only notice.
 *
 * **The variant's body, then the shared tail.**
 *
 * @throws {Error} when the facts describe a writable thread.
 */
export function recoveryResponseThreadReadOnlyNotice(
  facts: RecoveryResponseNoticeFacts,
): string {
  const variant = recoveryResponseThreadReadOnlyVariant(facts);

  if (variant === null) {
    throw new Error('A writable thread has no read-only notice.');
  }

  return `${RECOVERY_RESPONSE_NOTICE_BODY[variant]} ${READ_ONLY_NOTICE_TAIL}`;
}

/**
 * The informational message a `Match Confirmed` thread may render.
 *
 * **§13.5b permits it, and forbids it from implying the thread is
 * locked.** The text says the handoff is pending and the thread is still
 * the place to coordinate it.
 */
export const MATCH_CONFIRMED_THREAD_MESSAGE =
  'Owner confirmed this is a match. Physical handoff is pending. You can continue using this thread to coordinate the return.';
