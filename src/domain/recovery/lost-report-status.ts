/**
 * The Lost-side report status machine — FR-42's auto-transitions.
 *
 * **This is the Lost side's machine, and only the Lost side's.** A Lost
 * report passes through `Open` and `Verification Pending`; a Found report
 * passes through `Claim Requested` and `Claim Approved`. The two sets are
 * disjoint apart from `Open`, `Returned`, and `Closed`, and a transition
 * table that mixed them would permit a combination that cannot occur — a
 * Lost report going to `Claim Requested`, say.
 *
 * **The Found side has its own machine** in
 * `src/domain/listings/found-report-status.ts`, and this module does not
 * import it. The unit brief is explicit that the two *"must never share a
 * transition function, an aggregate, or a status enum"* — and the PRD keeps
 * them separate deliberately.
 *
 * ## The table is keyed by cause, not by status
 *
 * **The interesting question about each cause is where it lands.** "A
 * response was selected" and "the selected response was ruled not a match"
 * are different events with different outcomes, and only a cause can tell
 * them apart. A table keyed by status could not express "the *selected* one"
 * — only a cause can.
 *
 * ## `Match Confirmed` does not move the report
 *
 * **This is the machine's most consequential row — the one that is a
 * no-op.** A confirmed match leaves the report `Verification Pending`,
 * because the physical return has not been confirmed yet. FR-42 is explicit:
 * *"A Match Confirmed determination does NOT end Verification Pending; the
 * Lost report intentionally remains `Verification Pending` until Confirm
 * Returned transitions it to `Returned`."*
 *
 * **The row is present rather than absent,** and that is deliberate. An
 * absent row would mean "no rule exists", which is indistinguishable from
 * "not yet implemented" — and a reader could not tell whether the
 * determination was mishandled or merely unimplemented. A row that names
 * `Verification Pending` states the fact: the determination was considered,
 * and it lands here.
 *
 * ## `Returned` is not in this table
 *
 * **`Returned` is reachable only through Unit 005's explicit administrator
 * Confirm Returned action.** Story 005 is explicit: *"`Returned` is reached
 * only through Unit 005's Confirm Returned, never by a lifecycle transition
 * inside this unit. That is what keeps the return a single
 * implementation."* A table that listed it would make the thing the story
 * forbids one line away.
 *
 * ## `Closed` is reached by operations, not by workflow events
 *
 * The report's closure — a reporter's withdrawal, an administrator's close,
 * a documented exceptional cancellation — is an *operation* with its own
 * gate, and each lives in its own use case. This table names the causes so
 * that the lifecycle's shape is stated in one place, but the closure's
 * *conditions* (the withdrawal's post-Match-Confirmed block, the
 * cancellation's documentation requirement) belong to those use cases.
 *
 * ## `Returned` and `Closed` are terminal
 *
 * Nothing leaves them, and the table says so by having no row for them.
 *
 * Pure — no I/O, no framework imports.
 */

import { isTerminalReportStatus, type ReportStatus } from '@/domain/listings';

/**
 * What caused a Lost report's status to move.
 *
 * **The causes, not the statuses.** "A response was selected" and "the
 * selected response was ruled not a match" are different events with
 * different outcomes, and only a cause can tell them apart.
 */
export type LostReportTransitionCause =
  /** A Recovery Response was selected for verification. */
  | 'ResponseSelected'
  /**
   * The selected response was determined `Match Confirmed`.
   *
   * **A deliberate no-op on the report.** The row exists to state that the
   * determination was considered and deliberately leaves the report
   * `Verification Pending`.
   */
  | 'MatchConfirmed'
  /** The selected response was determined `Not a Match`. */
  | 'NotAMatch'
  /** The report was withdrawn by its reporter. */
  | 'ReporterWithdrawn'
  /** The report was closed by an administrator. */
  | 'AdministratorClosed';

/**
 * The outcome of a transition attempt.
 *
 * **The refusal is a distinct kind, not a null.** A caller that asked for a
 * transition that may not happen needs to be told *no*, and a nullable
 * status would make "no transition" indistinguishable from "a transition
 * to the status it already has".
 */
export type LostReportTransition =
  | { readonly kind: 'Moved'; readonly from: ReportStatus; readonly to: ReportStatus }
  | { readonly kind: 'Unchanged'; readonly status: ReportStatus }
  | { readonly kind: 'Refused'; readonly reason: LostReportTransitionRefusal };

/** Why a transition was refused. */
export type LostReportTransitionRefusal =
  /** The report is `Returned` or `Closed`. Nothing leaves a terminal status. */
  | 'TerminalStatus'
  /** The report is not a Lost report, or its status is not one this machine owns. */
  | 'NotALostReport'
  /** The cause does not apply to the report's current status. */
  | 'CauseNotApplicable';

/**
 * The statuses this machine owns.
 *
 * **The two non-terminal Lost statuses.** `Returned` and `Closed` are
 * terminal and belong to no machine; `Claim Requested` and `Claim Approved`
 * are the Found side's.
 */
export const LOST_REPORT_ACTIVE_STATUSES: readonly ReportStatus[] = Object.freeze([
  'Open',
  'Verification Pending',
]);

/**
 * The status a cause moves a Lost report to.
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
const TRANSITION_TARGETS: Readonly<Record<LostReportTransitionCause, ReportStatus>> =
  Object.freeze({
    ResponseSelected: 'Verification Pending',
    // **The deliberate no-op.** See the module's own note.
    MatchConfirmed: 'Verification Pending',
    NotAMatch: 'Open',
    ReporterWithdrawn: 'Closed',
    AdministratorClosed: 'Closed',
  });

/**
 * The status a cause moves a Lost report to.
 *
 * @throws {Error} when the cause is not one of the five — a caller that
 * invented a cause would be writing a transition the PRD does not name.
 */
export function lostReportTransitionTarget(
  cause: LostReportTransitionCause,
): ReportStatus {
  const target = TRANSITION_TARGETS[cause];

  if (target === undefined) {
    throw new Error(
      `"${String(cause)}" is not a Lost-report transition cause. This is a defect.`,
    );
  }

  return target;
}

/**
 * Decide what a cause does to a Lost report.
 *
 * **The refusal reasons are ordered by how fundamental they are.** A report
 * that is not a Lost report cannot be in this machine at all; a terminal
 * report accepts nothing; and only then is the cause's applicability
 * considered.
 *
 * @param reportType the report's type, as stored
 * @param currentStatus the report's current status, as stored
 * @param cause what happened
 */
export function decideLostReportTransition(
  reportType: string,
  currentStatus: string,
  cause: LostReportTransitionCause,
): LostReportTransition {
  // ── The report must be a Lost report ────────────────────────────────────
  //
  // **This machine is the Lost side's, and only the Lost side's.** A Found
  // report is not in it, and a report whose type is not one the PRD names
  // is not in it either.
  if (reportType !== 'Lost') {
    return { kind: 'Refused', reason: 'NotALostReport' };
  }

  // ── A terminal report accepts nothing ───────────────────────────────────
  //
  // **`Returned` and `Closed` are terminal** — and they are refused here,
  // before the cause is even consulted, so that no cause can name them.
  if (isTerminalReportStatus(currentStatus as ReportStatus)) {
    return { kind: 'Refused', reason: 'TerminalStatus' };
  }

  // ── The status must be one this machine owns ────────────────────────────
  //
  // **A status this machine does not own is refused.** `Claim Requested` and
  // `Claim Approved` are the Found side's, and a status the PRD does not
  // name belongs to no side at all.
  if (!isLostReportActiveStatus(currentStatus)) {
    return { kind: 'Refused', reason: 'NotALostReport' };
  }

  // ── The cause's applicability ──────────────────────────────────────────
  //
  // **Each cause applies from exactly one status.** A selection applies to
  // an `Open` report; a not-a-match applies to a `Verification Pending` one.
  // A cause that does not apply is refused rather than silently applied.
  if (!causeApplies(currentStatus, cause)) {
    return { kind: 'Refused', reason: 'CauseNotApplicable' };
  }

  const target = lostReportTransitionTarget(cause);

  // ── The no-op is reported as `Unchanged`, not as `Moved` ────────────────
  //
  // **A confirmed match leaves the report where it was.** The report is
  // already `Verification Pending` and stays there, and the caller is told
  // so honestly — the outcome is that nothing changed, not that the report
  // moved to the status it was already in.
  if (target === currentStatus) {
    return { kind: 'Unchanged', status: currentStatus };
  }

  return { kind: 'Moved', from: currentStatus, to: target };
}

/**
 * True when the cause applies from the report's current status.
 *
 * **The applicability is stated per cause, not inferred from the target.**
 * The target cannot distinguish "a selection applies" from "the report is
 * already where the selection would put it", and the distinction matters:
 * selecting into a report that is already `Verification Pending` is not the
 * same act as selecting into an `Open` one.
 */
function causeApplies(currentStatus: ReportStatus, cause: LostReportTransitionCause): boolean {
  switch (cause) {
    case 'ResponseSelected':
      // **A selection applies to an `Open` report.** The report reaches
      // `Verification Pending` *by* being selected into.
      return currentStatus === 'Open';

    case 'MatchConfirmed':
      // **A confirmed match applies to a `Verification Pending` report** —
      // the report is only there because a response was selected.
      return currentStatus === 'Verification Pending';

    case 'NotAMatch':
      // **A not-a-match applies to a `Verification Pending` report.**
      return currentStatus === 'Verification Pending';

    case 'ReporterWithdrawn':
    case 'AdministratorClosed':
      // **A closure applies from either active status.** A reporter may
      // withdraw an `Open` report, and may withdraw a `Verification Pending`
      // one that has not yet been matched; an administrator may close
      // either. The *conditions* on those closures belong to the operations
      // that perform them, not to this table.
      return currentStatus === 'Open' || currentStatus === 'Verification Pending';
  }
}

/**
 * True when the status is one this machine owns.
 *
 * **A report status the PRD does not place in the Lost lifecycle is
 * refused** — it belongs to the Found side, or to no side at all.
 */
export function isLostReportActiveStatus(status: string): status is ReportStatus {
  return (LOST_REPORT_ACTIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Assert that a cause moves a Lost report, or refuse.
 *
 * **The refusal throws rather than returning a result.** A caller that
 * ignored a refusal would write a transition the PRD does not name — and the
 * story's requirement is explicit that the transition throws rather than
 * silently degrading.
 *
 * @throws {Error} when the transition is refused.
 */
export function assertLostReportTransition(
  reportType: string,
  currentStatus: string,
  cause: LostReportTransitionCause,
): LostReportTransition {
  const transition = decideLostReportTransition(reportType, currentStatus, cause);

  if (transition.kind === 'Refused') {
    throw new Error(
      `A Lost report cannot move from "${currentStatus}" for the cause "${cause}". ${transition.reason}.`,
    );
  }

  return transition;
}
