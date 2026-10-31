/**
 * The owner's provisional selection — FR-43's selection rule.
 *
 * **Selection is the owner's own act, and it is provisional.** The owner
 * chooses one candidate to check; nothing is concluded. The story is
 * explicit: *"It commits the workflow to one candidate for checking, and
 * nothing more (D7)."*
 *
 * ## The rule
 *
 * The owner may select a response when:
 *
 * 1. the actor **is** the Lost report's owner, and
 * 2. the report is `Open`, and
 * 3. the response is `Submitted`.
 *
 * **Nothing here closes, rejects, or withdraws a sibling.** The selection
 * moves exactly one response; the siblings keep their status. That is the
 * story's criterion — *"no sibling has been closed, rejected, or withdrawn
 * as a side effect"* — and it is why this module returns a decision rather
 * than a set of writes.
 *
 * ## The report's move is part of the decision, not a side effect
 *
 * A selection moves the report from `Open` to `Verification Pending` (FR-42).
 * **That move is not optional and it is not something the caller decides
 * separately** — a selection that left the report `Open` would mean the
 * owner's choice had no effect on the workflow. So the decision carries the
 * report's new status, and the caller writes what the decision names.
 *
 * ## The `Match Confirmed` lock
 *
 * **FR-43 is emphatic: *"Match Confirmed does NOT unlock another
 * selection."*** Once the owner has determined a match, the outcome is
 * settled as far as selection goes — no further response may be selected and
 * no further new response is accepted.
 *
 * This is checked **unconditionally**, before the report-status whitelist is
 * consulted, for the same reason bolt 015's submission gate checks it
 * unconditionally: a settled match stops the workflow whatever else the
 * report's status says. A report whose status is `Verification Pending`
 * because of a *confirmed* match is not a report that may be selected into.
 *
 * ## The already-selected response is an idempotent no-op
 *
 * The story's edge case: *"Owner selects the already-selected response —
 * idempotent no-op; no duplicate audit entry."*
 *
 * **A no-op is not a refusal.** The owner clicking twice is not a mistake
 * that needs an error message; it is a repeated request for a state that
 * already holds. So the decision has a third outcome — `AlreadySelected` —
 * and the caller writes nothing and records nothing.
 *
 * ## The siblings are untouched, and that is structural
 *
 * **This module returns one response's new status, not a set.** A module
 * that returned "the responses to write" would invite the caller to write
 * more than it should. The siblings' fate is not in the decision at all, so
 * it cannot be got wrong.
 *
 * Pure — no I/O, no framework imports.
 */

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type { RecoveryResponseStatus } from './recovery-response-status';

/** The status a selected response reaches. */
export const SELECTED_FOR_VERIFICATION_STATUS: RecoveryResponseStatus =
  'Selected for Verification';

/** The report status a selection moves the Lost report to. */
export const VERIFICATION_PENDING_REPORT_STATUS = 'Verification Pending';

/**
 * Why a selection was refused.
 *
 * **The reasons differ in kind, and the owner's remedy differs with them.**
 *
 * - `NotOwner` — the actor has no right to select at all.
 * - `ReportNotOpen` — the report is not in a state that accepts a
 *   selection.
 * - `MatchConfirmed` — the outcome is settled.
 * - `ResponseNotSubmitted` — the response is not a candidate.
 */
export type SelectionRefusalReason =
  | 'NotOwner'
  | 'ReportNotOpen'
  | 'MatchConfirmed'
  | 'ResponseNotSubmitted';

/**
 * The outcome of a selection decision.
 *
 * **A permitted outcome carries the statuses it produces** — the response's
 * new status and the report's new status — so the caller writes what the
 * decision named rather than repeating the literals.
 */
export type SelectionDecision =
  | {
      readonly kind: 'Permitted';
      readonly responseStatus: RecoveryResponseStatus;
      readonly reportStatus: typeof VERIFICATION_PENDING_REPORT_STATUS;
    }
  | { readonly kind: 'AlreadySelected'; readonly reportStatus: string }
  | { readonly kind: 'Refused'; readonly reason: SelectionRefusalReason };

/** The facts the selection rule decides on. */
export interface SelectionFacts {
  /** The actor making the selection. */
  readonly actorId: string;
  /** The Lost report's owner. */
  readonly reportOwnerId: string;
  /** The report's current status. */
  readonly reportStatus: string;
  /** The response's current status. */
  readonly responseStatus: RecoveryResponseStatus;
  /**
   * Whether the selected response on this report has reached `Match
   * Confirmed`.
   *
   * **The fact about the *selected* response, not about this one.** The
   * lock is about the report's outcome, and the outcome is recorded on
   * whichever response is selected.
   */
  readonly hasMatchConfirmed: boolean;
}

/**
 * Decide whether the owner may select a response for verification.
 *
 * **The order of the checks is the rule's order.** The `Match Confirmed`
 * lock is consulted first — unconditionally — because a settled outcome
 * stops the workflow regardless of who is asking and whatever the report's
 * status says. Then ownership, then the report's status, then the response's
 * own status.
 *
 * **The already-selected case is checked before the refusal cases but after
 * the lock.** A repeated selection of the same response on a report whose
 * match is confirmed is *not* an idempotent no-op — the workflow has moved
 * on, and the honest answer is the lock.
 */
export function decideSelection(facts: SelectionFacts): SelectionDecision {
  // ── The lock, unconditionally ───────────────────────────────────────────
  //
  // **A confirmed match stops selection.** FR-43: *"Match Confirmed does
  // NOT unlock another selection: once Match Confirmed has been recorded, no
  // further response may be selected."*
  if (facts.hasMatchConfirmed) {
    return { kind: 'Refused', reason: 'MatchConfirmed' };
  }

  // ── Ownership ───────────────────────────────────────────────────────────
  //
  // **Only the Lost report's owner may select.** A responder who found the
  // item cannot choose which candidate the owner checks.
  if (facts.actorId !== facts.reportOwnerId) {
    return { kind: 'Refused', reason: 'NotOwner' };
  }

  // ── The response's own state ────────────────────────────────────────────
  //
  // **The already-selected response is an idempotent no-op.** The owner
  // clicking twice is a repeated request for a state that already holds, and
  // it is not a mistake that needs an error message.
  if (facts.responseStatus === 'Selected for Verification') {
    return { kind: 'AlreadySelected', reportStatus: facts.reportStatus };
  }

  // ── The response must be a candidate ────────────────────────────────────
  //
  // **Only a `Submitted` response may be selected.** A withdrawn response
  // cannot be selected (the story's edge case), and a response already
  // decided is not a candidate.
  if (facts.responseStatus !== 'Submitted') {
    return { kind: 'Refused', reason: 'ResponseNotSubmitted' };
  }

  // ── The report's status ─────────────────────────────────────────────────
  //
  // **Only an `Open` report accepts a selection.** The report reaches
  // `Verification Pending` *by* being selected into, so a report already
  // `Verification Pending` has a selection in progress — and one that
  // reached `Not a Match` has already been undone.
  if (facts.reportStatus !== 'Open') {
    return { kind: 'Refused', reason: 'ReportNotOpen' };
  }

  return {
    kind: 'Permitted',
    responseStatus: SELECTED_FOR_VERIFICATION_STATUS,
    reportStatus: VERIFICATION_PENDING_REPORT_STATUS,
  };
}

/**
 * The message that explains why a selection was refused.
 *
 * **One message per reason, and the reason names the remedy.** The copy
 * lives here so that every caller tells the owner the same thing.
 */
export function selectionRefusalMessage(reason: SelectionRefusalReason): string {
  switch (reason) {
    case 'NotOwner':
      return 'Only the owner of this report can select a response for verification.';
    case 'ReportNotOpen':
      return 'This report is not open, so a response cannot be selected for verification.';
    case 'MatchConfirmed':
      return 'This report’s match has already been confirmed, so no further response can be selected.';
    case 'ResponseNotSubmitted':
      return 'This response is no longer awaiting review, so it cannot be selected for verification.';
  }
}

/**
 * Assert that a selection is permitted, or refuse.
 *
 * **The refusal throws rather than returning `false`.** A caller that
 * ignored a `false` would proceed to write a selection the rules do not
 * permit — and the story requires that the refusal be unmistakable.
 *
 * **The already-selected case is not a refusal.** It returns normally, and
 * the caller checks the decision's kind to learn that nothing is to be
 * written.
 *
 * @throws {PermissionDeniedError} when the actor is not the report's owner.
 * @throws {ConflictError} when the workflow's state refuses the selection.
 */
export function assertSelectionPermitted(facts: SelectionFacts): SelectionDecision {
  const decision = decideSelection(facts);

  if (decision.kind === 'Refused') {
    const message = selectionRefusalMessage(decision.reason);

    if (decision.reason === 'NotOwner') {
      throw new PermissionDeniedError(message);
    }

    throw new ConflictError(message);
  }

  return decision;
}

/**
 * True when the owner may select a response.
 *
 * **The same decision as `decideSelection`,** read as a question — there is
 * no second answer to "may this response be selected?".
 */
export function maySelect(facts: SelectionFacts): boolean {
  return decideSelection(facts).kind === 'Permitted';
}
