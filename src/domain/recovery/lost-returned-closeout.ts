/**
 * The Lost-side Returned closeout — FR-45's atomic resolution.
 *
 * **This module decides *what* the closeout resolves and *which* responses
 * get which status.** It performs no writes and reads no rows; the
 * application layer performs the write, and the adapter obtains the set.
 *
 * ## The closeout is one act, and this module is its shape
 *
 * FR-42 and FR-45 say that when an administrator confirms the physical
 * return of a Lost report, **in one transaction**:
 *
 * - the Lost report becomes `Returned`;
 * - the **matched** response becomes `Completed — Report Returned`;
 * - **every other** non-terminal response becomes `Resolved — Report Returned`;
 * - every per-Recovery-Response thread becomes read-only;
 * - FR-46 events 7 (owner) and 8 (matched responder) fire.
 *
 * Those five things are not five operations that happen to be written
 * together. They are **one decision with five consequences**, and this
 * module expresses the decision as a pure function so that the two
 * consequences which could plausibly be got wrong — *which* response is
 * matched and *which* responses are resolved — have exactly one
 * implementation.
 *
 * ## The matched response is identified by id, never by position
 *
 * **The matched response is the one whose id the report's owner selected,
 * and it is named explicitly.** It is not "the first", not "the most
 * recently submitted", and not "the one with status `Match Confirmed`". The
 * report's own facts name it, and the caller passes that name in.
 *
 * The reason is that the three statuses below are **not
 * interchangeable**, and a rule that inferred the matched response from the
 * set would have to pick one of them and could pick wrong:
 *
 * - the matched response reaches `Completed — Report Returned`;
 * - the other non-terminal responses reach `Resolved — Report Returned`;
 * - the already-terminal responses are left alone.
 *
 * **A response that is already terminal is never touched.** A `Not a Match`
 * response was ruled out by the owner before the handoff, and a `Withdrawn`
 * response was withdrawn by its responder; neither is a casualty of the
 * handoff, and rewriting either would destroy history the audit trail
 * depends on.
 *
 * ## A matched response that is not `Match Confirmed` is refused
 *
 * **The matched response must be in a state that the handoff can complete.**
 * The PRD's success path is `Match Confirmed → Completed — Report Returned`,
 * and the table in `recovery-response-transition.ts` permits it from there.
 *
 * A matched response still sitting at `Selected for Verification` has not
 * been determined as a match, and completing it would assert a determination
 * that was never made. A matched response that is already terminal has
 * already ended. Both are refused — and the refusal is a **refusal, not a
 * partial application**: nothing is resolved, because a closeout that
 * resolved the other responses while leaving the matched one alone would
 * leave the report `Returned` with its matched response still in play.
 *
 * ## The set is the adapter's to obtain
 *
 * **This module does not read the responses.** It is handed the facts and
 * returns the plan. The set of responses to resolve is obtained by the
 * adapter's single `UPDATE … RETURNING` (ADR-10), so that a response
 * created concurrently is resolved rather than missed.
 *
 * This module's job is to say **which** rows the statement must match — the
 * non-terminal ones, minus the matched one — and to say what each becomes.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  isTerminalRecoveryResponseStatus,
  type RecoveryResponseStatus,
} from './recovery-response-status';

/**
 * The status the **matched** response reaches when the report is `Returned`.
 *
 * **The successful-recovery terminal status.** PRD FR-41: "`Completed —
 * Report Returned` — Canonical terminal status recorded on a Recovery
 * Response that **was** the one selected for verification when the Lost
 * report reaches `Returned`."
 */
export const COMPLETED_REPORT_RETURNED_STATUS = 'Completed — Report Returned';

/**
 * The status **every other** non-terminal response reaches.
 *
 * PRD FR-41: "`Resolved — Report Returned` — Canonical terminal status
 * recorded on a Recovery Response that was **not** the one selected for
 * verification when the Lost report reaches `Returned`."
 */
export const RESOLVED_REPORT_RETURNED_STATUS = 'Resolved — Report Returned';

/**
 * The status every non-terminal response reaches when the report is
 * `Closed`.
 *
 * PRD FR-41: "`Resolved — Report Closed` — Canonical terminal status recorded
 * on any Recovery Response that was still non-terminal when the parent Lost
 * report reached `Closed`."
 */
export const RESOLVED_REPORT_CLOSED_STATUS = 'Resolved — Report Closed';

/** A Recovery Response as the closeout sees it. */
export interface CloseoutResponse {
  readonly id: string;
  readonly status: RecoveryResponseStatus;
}

/** The facts the closeout decides on. */
export interface LostReturnedCloseoutFacts {
  /** The Lost report's id. */
  readonly reportId: string;
  /** The administrator confirming the physical return. */
  readonly actingAdministratorId: string;
  /** The Lost-report owner — the default receiver, and event 7's recipient. */
  readonly ownerId: string;
  /**
   * The response the owner selected and the administrator matched.
   *
   * **Named explicitly, never inferred from the set.** See the module's own
   * note.
   */
  readonly matchedResponseId: string;
  /** Every response on the report, in any status. */
  readonly responses: readonly CloseoutResponse[];
}

/** Why a closeout was refused. */
export type LostReturnedCloseoutRefusal =
  /** The matched response is not in a state the handoff can complete. */
  | 'MatchedResponseNotCompletable'
  /** The report named no matched response. */
  | 'NoMatchedResponse';

/**
 * The plan the closeout will execute.
 *
 * **The plan names what happens to every response,** so that a caller
 * cannot apply it partially: the matched response and the resolved set
 * together are the whole of the response-level work.
 */
export interface LostReturnedCloseoutPlan {
  readonly kind: 'Planned';
  readonly reportId: string;
  readonly actingAdministratorId: string;
  readonly ownerId: string;
  /** The matched response, and the status it reaches. */
  readonly matched: {
    readonly responseId: string;
    readonly previousStatus: RecoveryResponseStatus;
    readonly targetStatus: typeof COMPLETED_REPORT_RETURNED_STATUS;
  };
  /**
   * Every other non-terminal response, and the status each reaches.
   *
   * **The already-terminal responses are absent from this list on
   * purpose.** Their absence *is* the statement that they are left alone.
   */
  readonly resolved: readonly {
    readonly responseId: string;
    readonly previousStatus: RecoveryResponseStatus;
    readonly targetStatus: typeof RESOLVED_REPORT_RETURNED_STATUS;
  }[];
  /**
   * The ids of the responses the closeout leaves alone.
   *
   * **Named rather than implied,** so that the trail and the tests can
   * assert the *absence* of a change as directly as the presence of one.
   */
  readonly untouched: readonly {
    readonly responseId: string;
    readonly status: RecoveryResponseStatus;
  }[];
}

/** The outcome of deciding a closeout. */
export type LostReturnedCloseoutDecision =
  | LostReturnedCloseoutPlan
  | { readonly kind: 'Refused'; readonly reason: LostReturnedCloseoutRefusal };

/**
 * The statuses a matched response may be completed from.
 *
 * **Only `Match Confirmed`.** The PRD's success path is a determination of
 * match, then the handoff, then the completion. A response still at
 * `Selected for Verification` has not been determined as a match, and
 * completing it would assert a determination nobody made.
 */
export const MATCHED_RESPONSE_COMPLETABLE_STATUSES: readonly RecoveryResponseStatus[] =
  Object.freeze(['Match Confirmed'] as const);

/**
 * Decide the Lost-side Returned closeout.
 *
 * **Pure, total, and refusing rather than partially applying.** Every input
 * produces either a complete plan or a refusal; there is no third outcome,
 * and no refusal leaves part of the work done.
 */
export function decideLostReturnedCloseout(
  facts: LostReturnedCloseoutFacts,
): LostReturnedCloseoutDecision {
  const matched = facts.responses.find(
    (response) => response.id === facts.matchedResponseId,
  );

  // ── The matched response must exist ─────────────────────────────────────
  //
  // **A named response the report does not have is a refusal, not an empty
  // match.** A closeout with no matched response would resolve every
  // response to `Resolved — Report Returned` and complete nothing — a report
  // `Returned` whose successful response was silently demoted.
  if (!matched) {
    return { kind: 'Refused', reason: 'NoMatchedResponse' };
  }

  // ── The matched response must be completable ────────────────────────────
  //
  // **A matched response that is already terminal has already ended,** and a
  // matched response that has not been determined as a match cannot be
  // completed. Both are refused, and the refusal leaves the other responses
  // unresolved.
  if (!MATCHED_RESPONSE_COMPLETABLE_STATUSES.includes(matched.status)) {
    return { kind: 'Refused', reason: 'MatchedResponseNotCompletable' };
  }

  const resolved: {
    responseId: string;
    previousStatus: RecoveryResponseStatus;
    targetStatus: typeof RESOLVED_REPORT_RETURNED_STATUS;
  }[] = [];
  const untouched: {
    responseId: string;
    status: RecoveryResponseStatus;
  }[] = [];

  for (const response of facts.responses) {
    // **The matched response is not resolved.** It is completed, and it is
    // handled above; listing it here would ask the adapter to write two
    // different statuses to one row.
    if (response.id === facts.matchedResponseId) {
      continue;
    }

    // **A terminal response is left alone.**
    //
    // A `Not a Match` response was ruled out before the handoff; a
    // `Withdrawn` one was withdrawn by its responder; a response already at
    // `Resolved — Report Returned` or `Resolved — Report Closed` was ended
    // by an earlier terminal event. None of them is a casualty of this
    // handoff, and rewriting one would destroy the history the trail
    // depends on.
    if (isTerminalRecoveryResponseStatus(response.status)) {
      untouched.push({ responseId: response.id, status: response.status });
      continue;
    }

    resolved.push({
      responseId: response.id,
      previousStatus: response.status,
      targetStatus: RESOLVED_REPORT_RETURNED_STATUS,
    });
  }

  return {
    kind: 'Planned',
    reportId: facts.reportId,
    actingAdministratorId: facts.actingAdministratorId,
    ownerId: facts.ownerId,
    matched: {
      responseId: matched.id,
      previousStatus: matched.status,
      targetStatus: COMPLETED_REPORT_RETURNED_STATUS,
    },
    resolved,
    untouched,
  };
}

/**
 * The status a response reaches when the report is `Closed`.
 *
 * **Every non-terminal response reaches the same status.** Unlike the
 * Returned closeout, there is no "matched" exception — a closure ends
 * everything that is still in play, whatever its status.
 *
 * @throws {Error} when the status is already terminal. A terminal response
 * is not resolved by a closure; it is left alone, and asking this function
 * what a terminal response would become is a question with no answer.
 */
export function closedCloseoutTargetStatus(
  status: RecoveryResponseStatus,
): typeof RESOLVED_REPORT_CLOSED_STATUS {
  if (isTerminalRecoveryResponseStatus(status)) {
    throw new Error(
      `A Recovery Response at "${status}" is terminal and is not resolved by a closure.`,
    );
  }

  return RESOLVED_REPORT_CLOSED_STATUS;
}
