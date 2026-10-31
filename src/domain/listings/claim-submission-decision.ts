/**
 * The Claim submission gate — may this Claim be made?
 *
 * **This module decides, and nothing else.** It reads the facts and returns
 * a decision; it does not read a database, does not write a row, and does
 * not know what an API route is. The application layer supplies the facts
 * and acts on the verdict.
 *
 * **The refusals are distinct because the remedies differ.** A member who
 * claimed their own report is told to go and use the Lost side; a member
 * whose account is not `Active` is told to wait for approval; a member
 * whose claim would duplicate a pending one is told they already have one.
 * Collapsing them into one "not allowed" would leave the member with no
 * path forward, which is exactly what `EXPERIENCE.md` §4.8 forbids.
 *
 * **A `Claim` is made only against a `Found` report.** The Found side is
 * where a member says "this is mine"; the Lost side is where a finder says
 * "I found this". A Claim against a Lost report has no meaning, and the
 * report's own type is the first thing consulted.
 *
 * **The report's status decides whether the Claim can be made.** A `Claim
 * Approved` or `Closed` report has already been decided; a `Returned`
 * report is done. A report that is `Open` or `Claim Requested` can still
 * receive a Claim — `Claim Requested` is precisely the state a first
 * Claim puts it in, and a second member's Claim is legitimate then.
 *
 * **The one-`Pending`-Claim-per-item-per-member rule is a uniqueness
 * constraint, not only this check.** The story says so explicitly: "The
 * one-`Pending`-Claim-per-item-per-member rule is enforced by a database
 * uniqueness constraint, not only by an application check". This module
 * decides the *user-facing* outcome; the database decides the *fact*, and
 * the two agree because both exist. The application check alone would be a
 * race: two simultaneous submissions would both pass it.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/**
 * Why a Claim submission was refused.
 *
 * The reasons are **distinguishable** because the member's remedy differs:
 *
 * - `OwnReport` — the claimant is the Found report's owner. The remedy is
 *   the Lost side.
 * - `AccountNotActive` — the claimant's account is `Pending`, `Rejected`,
 *   or `Deactivated`. The remedy is approval.
 * - `NotFoundReport` — there is no such report. The remedy is to go back.
 * - `NotAFoundReport` — the report is a Lost report. The remedy is the Lost
 *   side.
 * - `ReportNotOpenForClaims` — the report is `Claim Approved`, `Returned`,
 *   or `Closed`. The remedy is to wait, or nothing.
 * - `AlreadyPendingClaim` — this member already has a `Pending` Claim on
 *   this item. The remedy is to wait for that one to be decided.
 */
export type ClaimSubmissionBlockReason =
  | 'OwnReport'
  | 'AccountNotActive'
  | 'NotFoundReport'
  | 'NotAFoundReport'
  | 'ReportNotOpenForClaims'
  | 'AlreadyPendingClaim';

/** The outcome of the submission gate. */
export type ClaimSubmissionDecision =
  | { readonly kind: 'Permitted' }
  | { readonly kind: 'Blocked'; readonly reason: ClaimSubmissionBlockReason };

/**
 * The facts the gate decides on.
 *
 * **Everything is supplied; nothing is read.** The gate is a pure function
 * of these facts, so it can be asserted against fixtures without a
 * database, and the application layer is the only place that knows how to
 * obtain them.
 */
export interface ClaimSubmissionFacts {
  /**
   * The report's type.
   *
   * `null` when no report carries the id — which is a distinct refusal from
   * a report of the wrong type.
   */
  readonly reportType: ReportType | null;
  /** The report's lifecycle status. */
  readonly reportStatus: ReportStatus | null;
  /** The Found report's owner. */
  readonly reportOwnerId: string | null;
  /** Whether this member already has a `Pending` Claim on this report. */
  readonly hasPendingClaim: boolean;
}

/**
 * Decide whether a Claim may be submitted.
 *
 * **The order of the checks is the order of the member's journey.** The
 * member's own identity is checked first (their account, then their
 * ownership of the report), then the report's state, then the duplicate
 * rule. A member whose account is not `Active` is refused for that reason
 * regardless of the report they named — telling them the report is closed
 * would leak a fact they were not entitled to.
 */
export function decideClaimSubmission(input: {
  readonly claimantId: string;
  readonly isAccountActive: boolean;
  readonly facts: ClaimSubmissionFacts;
}): ClaimSubmissionDecision {
  // ── The account ───────────────────────────────────────────────────────────
  //
  // **A `Pending` account cannot submit a claim.** The restriction is
  // enforced once, at the `ActorContext` boundary — this gate asks the
  // question it is given rather than re-deriving the account's status.
  if (!input.isAccountActive) {
    return { kind: 'Blocked', reason: 'AccountNotActive' };
  }

  // ── The report ───────────────────────────────────────────────────────────
  //
  // **A missing report and a report of the wrong type are different
  // refusals.** The first means the claim names something that does not
  // exist; the second means the member used the wrong side of the product.
  if (input.facts.reportType === null) {
    return { kind: 'Blocked', reason: 'NotFoundReport' };
  }

  if (input.facts.reportType !== 'Found') {
    return { kind: 'Blocked', reason: 'NotAFoundReport' };
  }

  // ── Own report ───────────────────────────────────────────────────────────
  //
  // **A member cannot claim their own report.** The member who *found* the
  // item is the report's owner, and the Claim is the opposite role: the
  // owner of the lost item. Claiming one's own report is a category error,
  // and it is refused with a **403** at the API layer.
  if (input.facts.reportOwnerId === input.claimantId) {
    return { kind: 'Blocked', reason: 'OwnReport' };
  }

  // ── The report's status ──────────────────────────────────────────────────
  //
  // **A decided report takes no more claims.** `Claim Approved` means an
  // administrator approved a claim; `Returned` and `Closed` are terminal.
  //
  // **A status the gate does not recognise is refused, not permitted.** The
  // rule is stated as a *whitelist* — `Open` and `Claim Requested` accept a
  // claim, and nothing else does — so a status this bolt has not seen (a
  // Lost-side status, or a null from a caller that could not read one) is
  // refused rather than waved through. A gate that permits by default is a
  // gate that fails open.
  const status = input.facts.reportStatus;

  if (status !== 'Open' && status !== 'Claim Requested') {
    return { kind: 'Blocked', reason: 'ReportNotOpenForClaims' };
  }

  // ── The duplicate ────────────────────────────────────────────────────────
  //
  // **One `Pending` Claim per item per member.** A member may have had a
  // Claim rejected and make another — the rule bounds *pending* Claims, not
  // claims. The database carries the same rule as a uniqueness constraint,
  // because this check alone cannot survive two simultaneous submissions.
  if (input.facts.hasPendingClaim) {
    return { kind: 'Blocked', reason: 'AlreadyPendingClaim' };
  }

  return { kind: 'Permitted' };
}

/**
 * The message that explains why a Claim was refused.
 *
 * **The copy is calm and carries no blame** (`EXPERIENCE.md` §4.8's
 * "Permission denied — no blame" tone), and each message names the path
 * forward where one exists.
 */
export function claimSubmissionBlockMessage(reason: ClaimSubmissionBlockReason): string {
  switch (reason) {
    case 'OwnReport':
      return 'This is your own report. You do not need to claim it.';
    case 'AccountNotActive':
      return 'Your account must be active before you can claim an item.';
    case 'NotFoundReport':
      return 'That item could not be found.';
    case 'NotAFoundReport':
      return 'Only found items can be claimed.';
    case 'ReportNotOpenForClaims':
      return 'This item is no longer accepting claims.';
    case 'AlreadyPendingClaim':
      return 'You already have a claim pending on this item.';
    default: {
      const unreachable: never = reason;
      throw new Error(`Unhandled claim submission block reason: ${String(unreachable)}`);
    }
  }
}
