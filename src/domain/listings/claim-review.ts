/**
 * The administrator's claim review screen — story 002's assembled data.
 *
 * **This is an assembly, not a projection.** The review screen is the one
 * place the finder is *not* a viewer of a Claim's private evidence: FR-37
 * and FR-39 permit an administrator to see the reason and the identifying
 * details, and story 002 says "this screen is the one place the finder is
 * not a viewer of them". So the screen carries the evidence, and the
 * *Found-report owner* is not a viewer of it.
 *
 * **The screen performs no state transition.** Story 002 is explicit: "The
 * review screen is a read-only assembly of Claim, item, and competing-Claim
 * data; it performs no state transition." So this module assembles; the
 * decision is a separate operation with its own gate.
 *
 * **Competing claims are shown by reference, and only the `Pending` ones.**
 * Story 002: "those other claims are listed by reference so the
 * administrator can see whether this is the only claim", and "other claims
 * on the same item that are `Approved` or `Rejected` ... are not counted in
 * or listed as competing pending claims". The reference is deliberately
 * thin — an id and a submission time — because the administrator judges
 * *this* claim, and the competitors' evidence is not what they are judging.
 *
 * **The count and the list cannot disagree.** The count is derived from
 * the list, not counted separately, so a screen can never say "two
 * competing claims" and show one. Story 002's edge case names this: "the
 * count matching the list length".
 *
 * **The Claim being reviewed is not in the competing list.** The competing
 * claims are *other* claims on the same item — the administrator needs to
 * know whether this claim is contested, and listing the reviewed claim
 * among its competitors would answer a different question.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ClaimStatus } from './claim-status';

/**
 * A competing Claim, by reference.
 *
 * **The reference is deliberately thin.** An id and a submission time are
 * what the administrator needs to know *that* a claim exists and *when* it
 * arrived; the competitor's reason and identifying details are not what
 * they are being asked to judge.
 */
export interface CompetingClaimReference {
  readonly claimId: string;
  readonly submittedAt: Date;
}

/**
 * The Found item's details, as the review screen shows them.
 *
 * **The item's own Sensitive Fields are not here.** The review screen is
 * about the *Claim*, and the item's details are what the Claim's claimant
 * is asserting against. The item's name, category, date, and campus area
 * are what an administrator needs; the exact place and the item's own
 * identifying details belong to the reporter.
 */
export interface ReviewItemDetails {
  readonly name: string;
  readonly category: string;
  /** The calendar day, as `YYYY-MM-DD`. */
  readonly date: string;
  readonly campusArea: string;
}

/**
 * The assembled review screen.
 *
 * **The evidence is here, because an administrator is entitled to it.**
 * The reason and the identifying details are FR-37 Sensitive Fields, and
 * the screen is administrator-only — the route refuses a non-administrator
 * before this assembly is ever built.
 */
export interface ClaimReviewScreen {
  readonly claimId: string;
  readonly claimStatus: ClaimStatus;
  /** The claimant's reason. An FR-37 Sensitive Field. */
  readonly reason: string;
  /** The claimant's identifying details. An FR-37 Sensitive Field. */
  readonly identifyingDetails: string;
  /** The calendar day the item went missing, as `YYYY-MM-DD`. */
  readonly dateLost: string;
  readonly submittedAt: Date;
  /** The Found item's details. */
  readonly item: ReviewItemDetails;
  /**
   * The other `Pending` Claims on the same item.
   *
   * **Only the `Pending` ones,** and never the Claim being reviewed.
   */
  readonly competingClaims: readonly CompetingClaimReference[];
  /**
   * How many `Pending` Claims compete with this one.
   *
   * **Derived from the list,** so the count and the list cannot disagree.
   */
  readonly competingClaimCount: number;
}

/**
 * The facts the review screen is assembled from.
 *
 * **The competing claims arrive already filtered.** The caller supplies the
 * *other* `Pending` Claims on the item; the filtering of `Approved` and
 * `Rejected` claims is the reader's job, because it is a query, not a
 * rule. The domain's job is to assemble what it is given — and to derive
 * the count from the list.
 */
export interface ClaimReviewFacts {
  readonly claimId: string;
  readonly claimStatus: ClaimStatus;
  readonly reason: string;
  readonly identifyingDetails: string;
  readonly dateLost: string;
  readonly submittedAt: Date;
  readonly item: ReviewItemDetails;
  /** The *other* `Pending` Claims on the same item. */
  readonly competingClaims: readonly CompetingClaimReference[];
}

/**
 * Assemble the review screen.
 *
 * **The count is derived, never counted separately.** A screen that said
 * "two competing claims" and listed one would tell the administrator the
 * claim is contested when it is not — and it would do so on exactly the
 * screen whose whole purpose is to answer that question.
 */
export function assembleClaimReview(facts: ClaimReviewFacts): ClaimReviewScreen {
  return {
    claimId: facts.claimId,
    claimStatus: facts.claimStatus,
    reason: facts.reason,
    identifyingDetails: facts.identifyingDetails,
    dateLost: facts.dateLost,
    submittedAt: facts.submittedAt,
    item: facts.item,
    competingClaims: facts.competingClaims,
    competingClaimCount: facts.competingClaims.length,
  };
}

/**
 * Whether the review screen offers the decision actions.
 *
 * **A Claim that is no longer `Pending` has no decision action.** Story 002:
 * "the decision action is unavailable and the recorded decision is shown
 * instead". The screen still assembles — an administrator following a
 * stale link must see *what happened*, not a 404 — but the actions are
 * gone.
 */
export function reviewOffersDecision(screen: ClaimReviewScreen): boolean {
  return screen.claimStatus === 'Pending';
}
