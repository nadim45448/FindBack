/**
 * The Found-side report status machine — FR-22's auto-transitions.
 *
 * **This is the Found side's machine, and only the Found side's.** A Found
 * report passes through `Open`, `Claim Requested`, and `Claim Approved`; a
 * Lost report passes through `Verification Pending`. The two sets are
 * disjoint apart from `Open`, `Returned`, and `Closed`, and a transition
 * table that mixed them would permit a combination that cannot occur — a
 * Found report going to `Verification Pending`, say.
 *
 * **The story's rule is about what *causes* a transition, not about what a
 * transition table looks like.** Story 005 says a report moves to `Claim
 * Requested` when the first Claim is submitted, back to `Open` when the
 * last remaining `Pending` Claim is rejected, and to `Claim Approved` when
 * a Claim is approved. So the table's rows are **causes**, not statuses:
 * "a Claim was submitted", "a Claim was rejected", "a Claim was approved".
 * A table keyed by status could not express "the last one" — only a cause
 * can.
 *
 * **The machine never reaches `Returned` by itself.** Story 005 is
 * explicit: "the system never auto-transitions the report directly to
 * `Returned` or `Closed`", and "reaching `Returned` requires an explicit
 * administrator Confirm Returned action". `Returned` is therefore **not a
 * row in this table** — it is reachable only through Unit 005's explicit
 * action, which writes it directly. A table that listed it would make the
 * thing the story forbids one line away.
 *
 * **The machine never reaches `Closed` by a claim event either.** `Closed`
 * is reached by withdrawal (FR-11) and by administrator closure (FR-21) —
 * both of which are *operations*, not claim events. `Claim Approved` can
 * reach `Closed` only through administrator close, never through a claim
 * event.
 *
 * **`Returned` and `Closed` are terminal.** Nothing leaves them, and the
 * table says so by having no row for them.
 *
 * **The withdrawal is an operation, not a transition in this table.** FR-11
 * says a reporter action never produces `Returned`, and the withdrawal
 * reaches `Closed` — but it does so as its own use case, because the
 * withdrawal is permitted only under its own gate. A generic transition
 * table would have `Closed` available to any cause.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportStatus } from './report-status';

/**
 * What caused a Found report's status to move.
 *
 * **The causes, not the statuses.** "The last Pending Claim was rejected"
 * and "a Pending Claim was rejected" are different events with different
 * outcomes, and only a cause can tell them apart.
 */
export type FoundReportTransitionCause =
  /** A Claim was submitted against the report. */
  | 'ClaimSubmitted'
  /** A Claim was approved against the report. */
  | 'ClaimApproved'
  /** A Claim was rejected — and it was the last Pending one. */
  | 'LastPendingClaimRejected'
  /** The report was withdrawn by its reporter. */
  | 'ReporterWithdrawn'
  /** The report was closed by an administrator. */
  | 'AdministratorClosed';

/**
 * The outcome of a transition attempt.
 *
 * **The refusal is a distinct kind, not a null.** A caller that asked for
 * a transition that may not happen needs to be told *no*, and a nullable
 * status would make "no transition" indistinguishable from "a transition
 * to the status it already has".
 */
export type FoundReportTransition =
  | { readonly kind: 'Moved'; readonly from: ReportStatus; readonly to: ReportStatus }
  | { readonly kind: 'Unchanged'; readonly status: ReportStatus }
  | { readonly kind: 'Refused'; readonly reason: FoundReportTransitionRefusal };

/** Why a transition was refused. */
export type FoundReportTransitionRefusal =
  /** The report is `Returned` or `Closed`. Nothing leaves a terminal status. */
  | 'TerminalStatus'
  /** The report is not a Found report, or its status is not one this machine owns. */
  | 'NotAFoundReport'
  /** The cause does not apply to the report's current status. */
  | 'CauseNotApplicable';

/**
 * The status a cause moves a report to.
 *
 * **The table is keyed by cause and states the *target*,** because the
 * interesting fact about each cause is where it lands, and the "is it
 * already there?" question is answered by the caller comparing the target
 * with the current status.
 *
 * **The table is total over the causes** — every cause has an entry, so an
 * illegal transition is a *lookup that misses* rather than "not yet
 * implemented".
 */
const TRANSITION_TARGETS: Readonly<
  Record<FoundReportTransitionCause, ReportStatus>
> = Object.freeze({
  ClaimSubmitted: 'Claim Requested',
  ClaimApproved: 'Claim Approved',
  LastPendingClaimRejected: 'Open',
  ReporterWithdrawn: 'Closed',
  AdministratorClosed: 'Closed',
});

/**
 * The status a cause moves a report to.
 *
 * @throws {Error} when the cause is not one of the five — a caller that
 * invented a cause would be writing a transition the PRD does not name.
 */
export function foundReportTransitionTarget(
  cause: FoundReportTransitionCause,
): ReportStatus {
  const target = TRANSITION_TARGETS[cause];

  if (target === undefined) {
    throw new Error(`Unhandled Found report transition cause: ${String(cause)}`);
  }

  return target;
}

/**
 * Decide the Found report's status transition.
 *
 * **The refusal is a refusal, not a no-op.** A terminal report refuses
 * every cause — including a cause that would have moved it to the status it
 * already has. A caller that gets `Unchanged` knows the report is in the
 * right place; a caller that gets `Refused` knows the action does not
 * apply, and must not write anything.
 *
 * **`ClaimSubmitted` moves an `Open` report to `Claim Requested` and leaves
 * a `Claim Requested` report alone.** The story says so: "the report status
 * remains `Claim Requested`". A second member's Claim is legitimate, and
 * the status the report already carries is the right one — moving it again
 * would write a transition that did not happen.
 */
export function decideFoundReportTransition(input: {
  readonly currentStatus: ReportStatus;
  readonly cause: FoundReportTransitionCause;
}): FoundReportTransition {
  const { currentStatus, cause } = input;

  // ── Terminal ────────────────────────────────────────────────────────────
  //
  // **Nothing leaves `Returned` or `Closed`.** Story 005: "the report is
  // terminal and remains in its status".
  if (currentStatus === 'Returned' || currentStatus === 'Closed') {
    return { kind: 'Refused', reason: 'TerminalStatus' };
  }

  // ── The machine owns five statuses ─────────────────────────────────────
  //
  // **A `Verification Pending` report is not a Found report.** The Lost
  // side's machine owns that status, and a Found report in it is a
  // contradiction rather than a transition.
  if (currentStatus === 'Verification Pending') {
    return { kind: 'Refused', reason: 'NotAFoundReport' };
  }

  const target = foundReportTransitionTarget(cause);

  // ── The cause must apply ───────────────────────────────────────────────
  //
  // **The causes are not all available from every status.** A `Claim
  // Approved` report has no Pending Claim to submit and none to reject, so
  // the two claim causes do not apply to it. Refusing them is what keeps
  // the machine from writing a transition that could not have happened.
  if (!causeApplies(cause, currentStatus)) {
    return { kind: 'Refused', reason: 'CauseNotApplicable' };
  }

  // ── The move ───────────────────────────────────────────────────────────
  if (target === currentStatus) {
    return { kind: 'Unchanged', status: currentStatus };
  }

  return { kind: 'Moved', from: currentStatus, to: target };
}

/**
 * Whether a cause applies to a status.
 *
 * **The rules, stated once.**
 *
 * - `ClaimSubmitted` — on `Open` and `Claim Requested`. A report already
 *   at `Claim Requested` stays there.
 * - `ClaimApproved` — on `Open` and `Claim Requested`. A report that
 *   already has a `Pending` Claim is at `Claim Requested`; a report at
 *   `Open` with a Claim is a contradiction, but the approval still lands
 *   it on `Claim Approved`, and refusing it would strand the Claim.
 * - `LastPendingClaimRejected` — on `Claim Requested`. The report is only
 *   at `Claim Requested` if a Claim had been submitted; a report at `Open`
 *   had no Pending Claim to reject.
 * - `ReporterWithdrawn` — on `Open` and `Claim Requested`. FR-11 blocks
 *   the withdrawal once a Claim is approved, which is `Claim Approved`.
 * - `AdministratorClosed` — on `Open`, `Claim Requested`, and `Claim
 *   Approved`. Story 005: "a report in `Open`, `Claim Requested`, or
 *   `Claim Approved` ... the report status becomes `Closed`".
 */
function causeApplies(
  cause: FoundReportTransitionCause,
  status: ReportStatus,
): boolean {
  switch (cause) {
    case 'ClaimSubmitted':
      return status === 'Open' || status === 'Claim Requested';
    case 'ClaimApproved':
      return status === 'Open' || status === 'Claim Requested';
    case 'LastPendingClaimRejected':
      return status === 'Claim Requested';
    case 'ReporterWithdrawn':
      return status === 'Open' || status === 'Claim Requested';
    case 'AdministratorClosed':
      return status === 'Open' || status === 'Claim Requested' || status === 'Claim Approved';
    default: {
      const unreachable: never = cause;
      throw new Error(`Unhandled Found report transition cause: ${String(unreachable)}`);
    }
  }
}

/**
 * The cause a claim's rejection raises.
 *
 * **A named helper, because "the last one" is a rule and not an
 * observation.** The caller knows how many `Pending` Claims remain; this
 * turns that count into the cause the machine understands.
 *
 * **A rejection that leaves other Claims pending raises `NoChange`.** The
 * report is already at `Claim Requested` and stays there — story 005: "the
 * Found report lifecycle status remains `Claim Requested`". The machine
 * must not move it to `Open` and then back, because both writes would be
 * transitions that did not happen.
 *
 * @param remainingPendingClaims how many `Pending` Claims remain on the
 * report **after** the rejection.
 */
export function rejectionCauseFor(
  remainingPendingClaims: number,
): FoundReportTransitionCause | 'NoChange' {
  return remainingPendingClaims === 0 ? 'LastPendingClaimRejected' : 'NoChange';
}
