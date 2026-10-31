/**
 * The reporter's action gate — which actions a member's own report offers.
 *
 * ## What this module is for
 *
 * EXPERIENCE.md §10.4 gives three reporter actions — **Edit**, **Delete**,
 * and **Withdraw** — and each has its own gate, and the gates are
 * **type-aware**. A Found report's gate turns on Claims; a Lost report's
 * turns on Recovery Responses. §10.4 says so explicitly: *"The Lost rule is
 * expressed in terms of `Recovery Response`s, **not** Claims."*
 *
 * The domain already owns the **decisions** — `decideDeletion`,
 * `decideWithdrawal`, and `isTerminalReportStatus`. This module owns the
 * **presentation of them**: which actions the detail surface offers, and
 * what it says when an action is blocked.
 *
 * ## Why a separate module rather than three calls at the surface
 *
 * §10.4's rules are not three independent gates. They interlock:
 *
 * - **Delete and Withdraw are alternatives.** §10.4: *"Once a Claim (Found)
 *   or RR (Lost) exists, the reporter must use Withdraw instead — hard
 *   delete is blocked."* So when delete is blocked by an interaction, the
 *   surface must offer **Withdraw instead** — never both, and never
 *   neither.
 * - **Withdraw has a further, type-specific block** that the deletion
 *   decision does not carry: a Found report is blocked at `Claim Approved`,
 *   and a Lost report is blocked once a selected RR reaches `Match
 *   Confirmed`. §10.4: *"Once a selected RR is `Match Confirmed`, the
 *   Lost-report owner does **not** see an enabled Withdraw action."*
 * - **A Lost report whose selected RR is `Match Confirmed` has no reporter
 *   terminal action at all.** Only an administrator may end that workflow.
 *   The surface must say so rather than render a dead button.
 *
 * **A surface that called the three decisions separately would have to
 * re-derive the interlocks** — and a re-derived interlock is a second
 * implementation of a rule the domain already owns. So the interlocks live
 * here, in one place, over the domain's own decisions.
 *
 * ## Edit is gated on terminal status alone
 *
 * §10.4: *"Blocked when the report is `Returned` **or** `Closed`."* Not
 * "until Returned" — once either is reached, edit is unavailable. That is
 * exactly `isTerminalReportStatus`, and there is no type asymmetry in it.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  decideDeletion,
  hasInteraction,
  type DeletionDecision,
  type InteractionFacts,
} from './report-deletion-decision';
import { decideWithdrawal, type WithdrawalDecision } from './report-withdrawal-decision';
import { isTerminalReportStatus, type ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/**
 * The three reporter actions.
 */
export const REPORTER_ACTIONS = ['edit', 'delete', 'withdraw'] as const;

/** One of the reporter's three actions. */
export type ReporterAction = (typeof REPORTER_ACTIONS)[number];

/**
 * Why an action is unavailable.
 *
 * **Every reason is distinguishable, because each names a different
 * remedy.** `TerminalStatus` says the report has ended and nothing can be
 * done; `InteractionExists` says the reporter must Withdraw instead;
 * `ClaimApproved` and `MatchConfirmed` say the workflow has moved past the
 * reporter's control and only an administrator may end it.
 */
export type ReporterActionBlockReason =
  /** The report is `Returned` or `Closed`. */
  | 'TerminalStatus'
  /** A Claim (Found) or Recovery Response (Lost) exists. */
  | 'InteractionExists'
  /** The Found report reached `Claim Approved`. */
  | 'ClaimApproved'
  /** A selected Recovery Response reached `Match Confirmed`. */
  | 'MatchConfirmed';

/**
 * The availability of one action.
 *
 * **`Permitted` and `Blocked` are the only two answers.** An action that is
 * blocked is **not** "hidden" — §10.4's companion rule says the surface
 * *"states the blocked-at-terminal reason in plain English rather than
 * silently doing nothing"*. So the block carries its reason, and the
 * surface renders it.
 */
export type ReporterActionAvailability =
  | { readonly kind: 'Permitted' }
  | { readonly kind: 'Blocked'; readonly reason: ReporterActionBlockReason };

/**
 * The facts the gate reads.
 *
 * **The report's own status and type, plus the interaction facts.** The
 * interaction facts are the same four booleans the deletion and withdrawal
 * decisions read, so the gate needs no fact the domain does not already
 * have.
 */
export interface ReporterActionFacts {
  readonly status: ReportStatus;
  readonly type: ReportType;
  readonly interactions: InteractionFacts;
}

/**
 * The availability of all three reporter actions.
 *
 * **One object, one place.** The surface renders what it is given rather
 * than deciding anything, and the interlocks between the three actions are
 * expressed once.
 */
export interface ReporterActionPlan {
  readonly edit: ReporterActionAvailability;
  readonly delete: ReporterActionAvailability;
  readonly withdraw: ReporterActionAvailability;
  /**
   * Whether only an administrator may end the workflow.
   *
   * **True for a Lost report whose selected Recovery Response has reached
   * `Match Confirmed`.** §10.4: *"Once a selected RR is `Match Confirmed`,
   * the Lost-report owner does **not** see an enabled Withdraw action"* and
   * *"only an Administrator may end the Lost workflow."* The surface says
   * this in plain English rather than offering a button that cannot work.
   */
  readonly administratorOnly: boolean;
}

/**
 * Decide whether Edit is available.
 *
 * **Terminal status alone.** §10.4 blocks Edit at `Returned` and `Closed`,
 * and nowhere else — a `Claim Approved` report is still editable.
 */
export function decideEditAvailability(
  status: ReportStatus,
): ReporterActionAvailability {
  if (isTerminalReportStatus(status)) {
    return { kind: 'Blocked', reason: 'TerminalStatus' };
  }

  return { kind: 'Permitted' };
}

/**
 * Decide whether Delete is available.
 *
 * **The domain's own deletion decision,** translated into the gate's
 * reason vocabulary.
 *
 * - `BlockedByInteraction` → `InteractionExists`. The remedy is Withdraw,
 *   and the surface offers it in this case.
 * - `BlockedByStatus` → `TerminalStatus`. **The remedy is *not* Withdraw**
 *   here — a `Returned` report cannot be withdrawn either — so the two
 *   blocked cases must not share a reason.
 */
export function decideDeleteAvailability(
  status: ReportStatus,
  type: ReportType,
  interactions: InteractionFacts,
): ReporterActionAvailability {
  const decision: DeletionDecision = decideDeletion(status, type, interactions);

  switch (decision.kind) {
    case 'Permitted':
      return { kind: 'Permitted' };
    case 'BlockedByInteraction':
      return { kind: 'Blocked', reason: 'InteractionExists' };
    case 'BlockedByStatus':
      return { kind: 'Blocked', reason: 'TerminalStatus' };
    default: {
      const unreachable: never = decision;
      throw new Error(`Unhandled deletion decision: ${String(unreachable)}`);
    }
  }
}

/**
 * Decide whether Withdraw is available.
 *
 * **The domain's own withdrawal decision,** translated into the gate's
 * reason vocabulary.
 *
 * - `TerminalStatus` → `TerminalStatus`.
 * - `ClaimApproved` → `ClaimApproved`.
 * - `MatchConfirmed` → `MatchConfirmed`.
 */
export function decideWithdrawAvailability(
  status: ReportStatus,
  type: ReportType,
  interactions: InteractionFacts,
): ReporterActionAvailability {
  const decision: WithdrawalDecision = decideWithdrawal(status, type, interactions);

  switch (decision.kind) {
    case 'Permitted':
      return { kind: 'Permitted' };
    case 'Blocked':
      return { kind: 'Blocked', reason: decision.reason };
    default: {
      const unreachable: never = decision;
      throw new Error(`Unhandled withdrawal decision: ${String(unreachable)}`);
    }
  }
}

/**
 * Build the reporter's action plan.
 *
 * **The interlocks are expressed here and nowhere else.**
 *
 * 1. **Delete and Withdraw are alternatives.** When delete is blocked by
 *    an interaction, the reporter's way out is Withdraw — so the plan
 *    carries the two decisions, and the *surface* offers Withdraw when
 *    delete is blocked by an interaction. The alternative relationship is
 *    structural: `decideDeletion` returns `BlockedByInteraction` **only**
 *    when the interaction exists, and `decideWithdrawal` consults the same
 *    interaction facts, so a report with an interaction can never have a
 *    permitted delete.
 *
 * 2. **A Lost report past `Match Confirmed` is administrator-only.** The
 *    withdrawal is blocked with `MatchConfirmed`, and that reason is what
 *    makes the workflow administrator-only.
 */
export function planReporterActions(facts: ReporterActionFacts): ReporterActionPlan {
  const edit = decideEditAvailability(facts.status);
  const deletion = decideDeleteAvailability(facts.status, facts.type, facts.interactions);
  const withdrawal = decideWithdrawAvailability(facts.status, facts.type, facts.interactions);

  const administratorOnly =
    withdrawal.kind === 'Blocked' && withdrawal.reason === 'MatchConfirmed';

  return { edit, delete: deletion, withdraw: withdrawal, administratorOnly };
}

/**
 * Whether the report carries an interaction that blocks Delete.
 *
 * **The type decides which fact counts** — a Found report's interaction is
 * a Claim, a Lost report's is a Recovery Response. This is the domain's own
 * `hasInteraction`, re-used rather than re-implemented.
 */
export function reportHasBlockingInteraction(
  type: ReportType,
  interactions: InteractionFacts,
): boolean {
  return hasInteraction(type, interactions);
}
