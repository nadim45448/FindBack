/**
 * The Lost-side closure decision — FR-21's two closure routes.
 *
 * **A Lost report closes in two ways, and they are not the same act.**
 *
 * 1. **An ordinary close.** The report is `Open` or `Verification Pending`,
 *    and no response has reached `Match Confirmed`. Every non-terminal
 *    response becomes `Resolved — Report Closed`, and the trail records
 *    FR-48 event 24.
 * 2. **An exceptional cancellation.** A response has reached
 *    `Match Confirmed` — the owner has determined the candidate *is* theirs
 *    and the handoff is pending — and the administrator cancels anyway,
 *    with a documented reason. The trail records FR-48 event 25.
 *
 * **The distinction is the whole point of this module.** The PRD's Edge
 * Case C closes the report *before* `Match Confirmed`; Edge Case D closes it
 * *after*. Both end in `Closed` and both resolve every non-terminal
 * response, but they are different administrative acts with different
 * records, and an ordinary close must not be able to absorb the exceptional
 * one — that would let a report whose owner has already confirmed a match be
 * closed without the documented reason the exceptional route demands.
 *
 * ## The gate is a fact about the responses, not a flag on the request
 *
 * **Whether the close is exceptional is decided by the report's own
 * responses,** read from the database — never by a field the client sends.
 * A client that could assert "this close is ordinary" on a report whose
 * matched response is `Match Confirmed` would be choosing which audit event
 * the report gets, which is precisely the thing the gate exists to prevent.
 *
 * The rule is stated over the **responses** rather than over the report's
 * status, because `Verification Pending` covers both the pre-determination
 * and the post-determination phases (PRD glossary). The report's status
 * cannot tell the two apart; the matched response's status can.
 *
 * ## The exceptional route requires a reason
 *
 * **A cancellation without a documented reason is refused.** The reason is
 * the only record of *why* a report whose owner had already confirmed a match
 * was abandoned, and the PRD is explicit that event 25 carries it.
 *
 * The reason is bounded exactly as an administrator's Found-side closure
 * reason is bounded — 10–500 characters, inclusive — because the two are
 * the same kind of field: administrator-supplied free text recorded on the
 * trail. The bound lives in `listings/report-closure-reason.ts`, and this
 * module reuses it rather than restating it.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  createReportClosureReason,
  type ReportClosureReason,
} from '@/domain/listings';

import type { RecoveryResponseStatus } from './recovery-response-status';

/** How the report reached `Closed`. */
export type LostClosureRoute =
  /** An ordinary administrator close — FR-48 event 24. */
  | 'OrdinaryClosure'
  /** An exceptional cancellation after `Match Confirmed` — FR-48 event 25. */
  | 'ExceptionalCancellation';

/** A Recovery Response as the closure decision sees it. */
export interface ClosureResponse {
  readonly id: string;
  readonly status: RecoveryResponseStatus;
}

/** The facts the closure decision reads. */
export interface LostClosureFacts {
  /** The Lost report's id. */
  readonly reportId: string;
  /** The administrator closing the report. */
  readonly actingAdministratorId: string;
  /**
   * The report's current status.
   *
   * **`Verification Pending` covers both the pre- and post-determination
   * phases,** so it does not by itself distinguish the two closure routes.
   */
  readonly reportStatus: string;
  /** Every response on the report. */
  readonly responses: readonly ClosureResponse[];
  /**
   * The administrator's reason.
   *
   * **Required on both routes.** The PRD's FR-21 records "the documented
   * reason" on every administrator closure, and the exceptional route's
   * "documented exceptional reason" is the same field under a sterner rule —
   * it is the *only* thing that distinguishes an abandonment from a
   * mistake.
   */
  readonly reason: string;
}

/** Why a closure was refused. */
export type LostClosureRefusal =
  /** The report is `Returned` or `Closed` — it is terminal. */
  | 'TerminalReport'
  /** The report is not a Lost report. */
  | 'NotALostReport'
  /** The report's status is not one the Lost machine owns. */
  | 'StatusNotApplicable'
  /** A response has reached `Match Confirmed` and no reason was given. */
  | 'ExceptionalReasonRequired';

/** The outcome of deciding a closure. */
export type LostClosureDecision =
  | {
      readonly kind: 'Permitted';
      readonly reportId: string;
      readonly actingAdministratorId: string;
      /** Which of the two routes this close takes. */
      readonly route: LostClosureRoute;
      /** The reason, validated. */
      readonly reason: ReportClosureReason;
      /**
       * The responses that reach `Match Confirmed`, if any.
       *
       * **Empty on the ordinary route; non-empty on the exceptional one.**
       * The set is what makes the route exceptional, so it is named.
       */
      readonly matchedResponses: readonly {
        readonly responseId: string;
        readonly status: RecoveryResponseStatus;
      }[];
    }
  | { readonly kind: 'Refused'; readonly reason: LostClosureRefusal };

/** The Lost report statuses that may still be closed. */
export const CLOSABLE_LOST_REPORT_STATUSES: readonly string[] = Object.freeze([
  'Open',
  'Verification Pending',
]);

/**
 * Decide whether a Lost report may be closed, and by which route.
 *
 * **The reason is validated first,** because a close with no usable reason
 * is refused before anything is read or written — a trail entry with no
 * reason explains nothing.
 */
export function decideLostClosure(facts: LostClosureFacts): LostClosureDecision {
  // ── The reason, first ───────────────────────────────────────────────────
  //
  // **A reason that breaks its bound is refused before the report is even
  // read.** The reason is required on both routes, so there is no route on
  // which a malformed reason is acceptable.
  const reason = createReportClosureReason(facts.reason);

  // ── The report's own kind ───────────────────────────────────────────────
  if (!CLOSABLE_LOST_REPORT_STATUSES.includes(facts.reportStatus)) {
    // **`Returned` and `Closed` are refused** — the report is terminal and
    // nothing leaves it. Any other status is one this machine does not
    // own, which is a different refusal.
    const refusal: LostClosureRefusal =
      facts.reportStatus === 'Returned' || facts.reportStatus === 'Closed'
        ? 'TerminalReport'
        : 'StatusNotApplicable';

    return { kind: 'Refused', reason: refusal };
  }

  // ── The matched responses ───────────────────────────────────────────────
  //
  // **A response at `Match Confirmed` is the exceptional trigger.** The
  // owner has determined the candidate is theirs and the handoff is pending;
  // closing the report now is a cancellation, not an ordinary close.
  const matchedResponses = facts.responses
    .filter((response) => response.status === 'Match Confirmed')
    .map((response) => ({ responseId: response.id, status: response.status }));

  if (matchedResponses.length > 0) {
    // **The exceptional route is taken, and the reason is already
    // validated.** The reason is not optional here — but it is *required* on
    // the ordinary route too, so the validation above covers both and this
    // branch only has to name the route.
    return {
      kind: 'Permitted',
      reportId: facts.reportId,
      actingAdministratorId: facts.actingAdministratorId,
      route: 'ExceptionalCancellation',
      reason,
      matchedResponses,
    };
  }

  return {
    kind: 'Permitted',
    reportId: facts.reportId,
    actingAdministratorId: facts.actingAdministratorId,
    route: 'OrdinaryClosure',
    reason,
    matchedResponses: [],
  };
}
