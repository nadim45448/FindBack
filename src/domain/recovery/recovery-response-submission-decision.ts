/**
 * The Recovery Response submission gate — may this Response be made?
 *
 * **This module decides, and nothing else.** It reads the facts and returns
 * a decision; it does not read a database, does not write a row, and does
 * not know what an API route is. The application layer supplies the facts
 * and acts on the verdict.
 *
 * **The refusals are distinct because the remedies differ.** A responder who
 * responded to their own Lost report is told to go and use the Found side; a
 * responder whose account is not `Active` is told to wait for approval; a
 * responder who already holds a live response on the same report is told
 * that they already have one. Collapsing them into one "not allowed" would
 * leave the responder with no path forward, which is what
 * `EXPERIENCE.md` §4.8 forbids.
 *
 * **A `RecoveryResponse` is made only against a `Lost` report.** The Lost
 * side is where a finder says "I found this"; the Found side is where a
 * member says "this is mine". A Response against a Found report has no
 * meaning, and the report's own type is the first thing consulted.
 *
 * ## The acceptance window
 *
 * **FR-40's rule is a whitelist of two statuses: `Open` and
 * `Verification Pending`.** A `Returned` or `Closed` report takes no further
 * response, and neither does any status the gate does not recognise — the
 * rule is stated as a whitelist so a status this bolt has not seen is
 * **refused rather than waved through**. A gate that permits by default is a
 * gate that fails open.
 *
 * **The `Verification Pending` case has its own rule on top of the
 * whitelist**, and this is the subtle one. A response submitted while the
 * report is `Verification Pending` is accepted *only while the selected
 * response has not reached `Match Confirmed`*. Once the match is confirmed,
 * the workflow proceeds to physical handoff, and no further response may be
 * accepted or selected.
 *
 * **The `Match Confirmed` cutoff is checked even when the report is `Open`.**
 * It costs nothing to check and it is the safe direction: if the report were
 * to be `Open` with a confirmed match — which the workflow does not produce,
 * but a future path might — accepting a new response would be wrong.
 *
 * ## The one-live-response rule
 *
 * **A responder may hold at most one non-terminal Recovery Response on a
 * given Lost report.** The non-terminal statuses are `Submitted`, `Selected
 * for Verification`, and `Match Confirmed` — the last of which is
 * non-terminal in the domain's own sense (FR-41), so it counts here too.
 *
 * **A responder whose prior response reached a terminal status may respond
 * again.** The rule bounds *live* responses, not responses: a responder whose
 * response was `Not a Match` may submit a fresh one, and the prior record is
 * preserved rather than reactivated.
 *
 * **The rule is a uniqueness constraint as well as this check.** The story's
 * sibling — the one-`Pending`-Claim rule — says explicitly that the database
 * is the fact and the application check is the explanation, because the check
 * alone cannot survive two simultaneous submissions. The same holds here.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportStatus } from '@/domain/listings/report-status';
import type { ReportType } from '@/domain/listings/report-type';

import type { RecoveryResponseStatus } from './recovery-response-status';

/**
 * Why a Recovery Response submission was refused.
 *
 * The reasons are **distinguishable** because the responder's remedy differs:
 *
 * - `OwnReport` — the responder is the Lost report's owner. The remedy is
 *   the Found side.
 * - `AccountNotActive` — the responder's account is `Pending`, `Rejected`,
 *   or `Deactivated`. The remedy is approval.
 * - `NotFoundReport` — there is no such report. The remedy is to go back.
 * - `NotALostReport` — the report is a Found report. The remedy is a Claim.
 * - `ReportNotOpenForResponses` — the report is `Returned`, `Closed`, or a
 *   status this gate does not recognise. The remedy is to wait, or nothing.
 * - `MatchAlreadyConfirmed` — the selected response has reached
 *   `Match Confirmed`. The remedy is the physical handoff.
 * - `AlreadyHasLiveResponse` — the responder already holds a non-terminal
 *   Response on this report. The remedy is to wait for that one to resolve.
 */
export type RecoveryResponseSubmissionBlockReason =
  | 'OwnReport'
  | 'AccountNotActive'
  | 'NotFoundReport'
  | 'NotALostReport'
  | 'ReportNotOpenForResponses'
  | 'MatchAlreadyConfirmed'
  | 'AlreadyHasLiveResponse';

/** The outcome of the submission gate. */
export type RecoveryResponseSubmissionDecision =
  | { readonly kind: 'Permitted' }
  | { readonly kind: 'Blocked'; readonly reason: RecoveryResponseSubmissionBlockReason };

/**
 * The facts the gate decides on.
 *
 * **Everything is supplied; nothing is read.** The gate is a pure function
 * of these facts, so it can be asserted against fixtures without a
 * database, and the application layer is the only place that knows how to
 * obtain them.
 */
export interface RecoveryResponseSubmissionFacts {
  /**
   * The report's type.
   *
   * `null` when no report carries the id — which is a distinct refusal from
   * a report of the wrong type.
   */
  readonly reportType: ReportType | null;
  /** The report's lifecycle status. */
  readonly reportStatus: ReportStatus | null;
  /** The Lost report's owner. */
  readonly reportOwnerId: string | null;
  /**
   * Whether the selected response on this report has reached
   * `Match Confirmed`.
   *
   * `null` when no response is selected, or when the selected response is
   * not in a state the gate can read. **`null` is not "confirmed"** — the
   * safe reading of an unknown selected state is that the match is *not*
   * yet confirmed, because that is the state in which a submission is
   * permitted.
   */
  readonly hasMatchConfirmed: boolean;
  /**
   * Whether the responder already holds a **non-terminal** Response on this
   * report.
   *
   * A responder whose prior Response reached a terminal status does **not**
   * count — they may respond again.
   */
  readonly hasLiveResponse: boolean;
}

/**
 * Decide whether a Recovery Response may be submitted.
 *
 * **The order of the checks is the order of the responder's journey.** The
 * responder's own identity is checked first (their account, then their
 * ownership of the report), then the report's type and state, then the
 * workflow's own cutoff, and last the responder's own history. A responder
 * whose account is not `Active` is refused for that reason regardless of the
 * report they named — telling them the report is closed would leak a fact
 * they were not entitled to.
 */
export function decideRecoveryResponseSubmission(input: {
  readonly responderId: string;
  readonly isAccountActive: boolean;
  readonly facts: RecoveryResponseSubmissionFacts;
}): RecoveryResponseSubmissionDecision {
  // ── The account ───────────────────────────────────────────────────────────
  //
  // **A `Pending` account cannot respond.** The restriction is enforced once,
  // at the `ActorContext` boundary — this gate asks the question it is given
  // rather than re-deriving the account's status.
  if (!input.isAccountActive) {
    return { kind: 'Blocked', reason: 'AccountNotActive' };
  }

  // ── The report ───────────────────────────────────────────────────────────
  //
  // **A missing report and a report of the wrong type are different
  // refusals.** The first means the response names something that does not
  // exist; the second means the responder used the wrong side of the
  // product.
  if (input.facts.reportType === null) {
    return { kind: 'Blocked', reason: 'NotFoundReport' };
  }

  if (input.facts.reportType !== 'Lost') {
    return { kind: 'Blocked', reason: 'NotALostReport' };
  }

  // ── Own report ───────────────────────────────────────────────────────────
  //
  // **A member cannot respond to their own Lost report.** The member who
  // *lost* the item is the report's owner, and the Response is the opposite
  // role: someone who may have found it. Responding to one's own report is a
  // category error, and it is refused with a **403** at the API layer.
  if (input.facts.reportOwnerId === input.responderId) {
    return { kind: 'Blocked', reason: 'OwnReport' };
  }

  // ── The report's status ──────────────────────────────────────────────────
  //
  // **Only `Open` and `Verification Pending` accept a response** (FR-40).
  // The rule is a **whitelist**: every other status — recognised, unrecognised,
  // or absent — is refused. `Returned` and `Closed` are terminal; the
  // Found-side statuses (`Claim Requested`, `Claim Approved`) are on the
  // other side of the product and must never reach this path; and a `null`
  // from a caller that could not read the status is refused rather than
  // treated as fine.
  const status = input.facts.reportStatus;

  if (status !== 'Open' && status !== 'Verification Pending') {
    return { kind: 'Blocked', reason: 'ReportNotOpenForResponses' };
  }

  // ── The match cutoff ─────────────────────────────────────────────────────
  //
  // **Once the match is confirmed, no further response is accepted** (FR-40,
  // UJ-5 Edge Case B). The workflow proceeds to physical handoff, and a new
  // responder arriving now would be responding to a settled outcome.
  //
  // **The check is unconditional on the report's status**, which costs
  // nothing and is the safe direction: the workflow never produces an `Open`
  // report with a confirmed match, but a path that did would want this
  // refusal.
  if (input.facts.hasMatchConfirmed) {
    return { kind: 'Blocked', reason: 'MatchAlreadyConfirmed' };
  }

  // ── The responder's own live response ────────────────────────────────────
  //
  // **One non-terminal response per responder per report.** A responder who
  // already holds a `Submitted`, `Selected for Verification`, or
  // `Match Confirmed` response may not add another.
  //
  // **A terminal prior response does not count.** The rule bounds live
  // responses, not responses: a `Not a Match` or `Withdrawn` response is
  // preserved history, and the responder may respond again.
  if (input.facts.hasLiveResponse) {
    return { kind: 'Blocked', reason: 'AlreadyHasLiveResponse' };
  }

  return { kind: 'Permitted' };
}

/**
 * The message that explains why a Recovery Response was refused.
 *
 * **The copy is calm and carries no blame** (`EXPERIENCE.md` §4.8's
 * "Permission denied — no blame" tone), and each message names the path
 * forward where one exists.
 */
export function recoveryResponseSubmissionBlockMessage(
  reason: RecoveryResponseSubmissionBlockReason,
): string {
  switch (reason) {
    case 'OwnReport':
      return 'This is your own report. You do not need to respond to it.';
    case 'AccountNotActive':
      return 'Your account must be active before you can respond to a lost item.';
    case 'NotFoundReport':
      return 'That report could not be found.';
    case 'NotALostReport':
      return 'Only lost items accept a recovery response.';
    case 'ReportNotOpenForResponses':
      return 'This lost item is no longer accepting responses.';
    case 'MatchAlreadyConfirmed':
      return 'This lost item has already been matched and is being returned.';
    case 'AlreadyHasLiveResponse':
      return 'You already have an open response on this lost item.';
    default: {
      const unreachable: never = reason;
      throw new Error(
        `Unhandled recovery response submission block reason: ${String(unreachable)}`,
      );
    }
  }
}

/**
 * The statuses that count as a **live** response for the one-per-responder
 * rule.
 *
 * **These are the domain's non-terminal statuses**, and they are **derived**
 * rather than written out — so a status added to the vocabulary is classified
 * by exactly one of the two sets, and a status listed in both is impossible.
 *
 * **`Match Confirmed` is in the set**, and it is the least obvious member of
 * it: FR-41 makes it non-terminal (the Lost report stays `Verification
 * Pending` until the administrator confirms the physical hand-off), so a
 * responder holding one still holds a live response and may not add another.
 */
export const LIVE_RECOVERY_RESPONSE_STATUSES: readonly RecoveryResponseStatus[] = Object.freeze([
  'Submitted',
  'Selected for Verification',
  'Match Confirmed',
]);
