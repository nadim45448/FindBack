/**
 * The `WithdrawalDecision` — may this report be withdrawn by its reporter?
 *
 * **The rules differ by report type**, and the difference is not incidental:
 *
 * - **Found:** allowed on `Open` or `Claim Requested`; blocked on `Claim
 *   Approved`, `Returned`, `Closed`.
 * - **Lost:** allowed on `Open` or `Verification Pending` **before Match
 *   Confirmed has been recorded**; blocked once Match Confirmed is recorded,
 *   and on `Returned` and `Closed`.
 *
 * **Both sides consult a dependent record's state, not only the report's
 * own status.** The Found-side block turns on a `Claim Approved` Claim; the
 * Lost-side block turns on a `Match Confirmed` Recovery Response. Both of
 * those are *sub-aggregate* statuses — `Match Confirmed` is a Recovery
 * Response status, **not** a Lost-report lifecycle status — so the guard
 * asks whether that status has been recorded on the report.
 *
 * **Withdrawal reaches `Closed`, never `Returned`.** There is no path by
 * which a reporter action produces a `Returned` status. That is why the
 * withdrawal is modelled as its own operation rather than as a generic
 * status transition: a generic transition table would have `Returned`
 * available to it.
 *
 * Pure — no I/O, no framework imports.
 */

import type { InteractionFacts } from './report-deletion-decision';
import type { ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/**
 * Why a withdrawal was refused.
 *
 * The reasons are **distinguishable** because the member's remedy differs:
 * a post-Match-Confirmed Lost report cannot be withdrawn by anyone through
 * this path, while a `Returned` report was already closed by an
 * administrator.
 */
export type WithdrawalBlockReason =
  | 'TerminalStatus'
  | 'ClaimApproved'
  | 'MatchConfirmed';

/** The outcome of the withdrawal gate. */
export type WithdrawalDecision =
  | { readonly kind: 'Permitted' }
  | { readonly kind: 'Blocked'; readonly reason: WithdrawalBlockReason };

/**
 * Decide whether a report may be withdrawn.
 *
 * **The terminal check runs first.** `Returned` and `Closed` are terminal
 * for every operation, and a report that has reached them has no
 * interaction state worth consulting.
 */
export function decideWithdrawal(
  status: ReportStatus,
  type: ReportType,
  facts: InteractionFacts,
): WithdrawalDecision {
  if (status === 'Returned' || status === 'Closed') {
    return { kind: 'Blocked', reason: 'TerminalStatus' };
  }

  switch (type) {
    case 'Found':
      return decideFoundWithdrawal(status, facts);
    case 'Lost':
      return decideLostWithdrawal(status, facts);
    default: {
      const unreachable: never = type;
      throw new Error(`Unhandled report type: ${String(unreachable)}`);
    }
  }
}

/**
 * The Found-side withdrawal rule.
 *
 * **Allowed** on `Open` and `Claim Requested`.
 *
 * **Blocked** on `Claim Approved` — the report's own status — and once any
 * Claim on it has been **approved**. The PRD says "Once a Claim is
 * `Approved`, reporter withdrawal is blocked", and a Claim that has been
 * approved moves the report to `Claim Approved`, so the two agree. The
 * approved-Claim fact is consulted as well because it is the fact the PRD
 * names, and a report can be mid-transition between the two writes.
 */
function decideFoundWithdrawal(
  status: ReportStatus,
  facts: InteractionFacts,
): WithdrawalDecision {
  if (status === 'Claim Approved' || facts.hasApprovedClaim) {
    return { kind: 'Blocked', reason: 'ClaimApproved' };
  }

  if (status === 'Open' || status === 'Claim Requested') {
    return { kind: 'Permitted' };
  }

  // `Verification Pending` is a Lost-side status and cannot occur on a
  // Found report. Reaching here means an unknown status reached the gate,
  // which is a defect rather than a business outcome.
  return { kind: 'Blocked', reason: 'TerminalStatus' };
}

/**
 * The Lost-side withdrawal rule.
 *
 * **Allowed** on `Open` and on `Verification Pending` **before Match
 * Confirmed has been recorded**.
 *
 * **Blocked** once Match Confirmed is recorded — even though the report is
 * still `Verification Pending` at that point, and even though `Match
 * Confirmed` is not a report status at all.
 */
function decideLostWithdrawal(
  status: ReportStatus,
  facts: InteractionFacts,
): WithdrawalDecision {
  if (facts.hasMatchConfirmed) {
    return { kind: 'Blocked', reason: 'MatchConfirmed' };
  }

  if (status === 'Open' || status === 'Verification Pending') {
    return { kind: 'Permitted' };
  }

  // `Claim Requested` and `Claim Approved` are Found-side statuses and
  // cannot occur on a Lost report.
  return { kind: 'Blocked', reason: 'TerminalStatus' };
}

/**
 * The message that explains why a withdrawal was refused.
 *
 * The copy is calm and carries no blame (`EXPERIENCE.md` §4.9's
 * "Permission denied — no blame" tone), and it names the path forward
 * where one exists.
 */
export function withdrawalBlockMessage(reason: WithdrawalBlockReason): string {
  switch (reason) {
    case 'TerminalStatus':
      return 'This report has already been closed.';
    case 'ClaimApproved':
      return 'A claim has been approved for this item, so it can no longer be withdrawn.';
    case 'MatchConfirmed':
      return 'This item has been matched, so it can no longer be withdrawn.';
    default: {
      const unreachable: never = reason;
      throw new Error(`Unhandled withdrawal block reason: ${String(unreachable)}`);
    }
  }
}
