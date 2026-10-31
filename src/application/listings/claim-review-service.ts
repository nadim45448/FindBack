/**
 * The `ClaimReviewService` — story 002's administrator review screen.
 *
 * **A read-only assembly.** Story 002: "The review screen is a read-only
 * assembly of Claim, item, and competing-Claim data; it performs no state
 * transition." So this service reads, assembles, and returns. It writes
 * nothing, opens no transaction, and touches no audit trail.
 *
 * **The evidence is here because an administrator is entitled to it.**
 * FR-37 and FR-39 permit an administrator to see a Claim's reason and
 * identifying details; story 002 says "this screen is the one place the
 * finder is not a viewer of them". The *route* refuses a non-administrator
 * before this service is reached, so the evidence never leaves the
 * administrator's reach.
 *
 * **The count is derived, not counted.** The service assembles the screen
 * through the domain's `assembleClaimReview`, which derives the count from
 * the list — so the count and the list cannot disagree.
 *
 * **A decided Claim still assembles.** Story 002: "Given a claim that is
 * no longer `Pending` ... the decision action is unavailable and the
 * recorded decision is shown instead". An administrator following a stale
 * link must see *what happened*, not a 404 — so the service returns the
 * screen and the *route* is what decides that the decision actions are
 * gone.
 *
 * Pure orchestration — the ports do the I/O.
 */

import {
  assembleClaimReview,
  reviewOffersDecision,
  type ClaimReviewScreen,
} from '@/domain/listings';

import { NotFoundError } from '@/lib/errors';

import type { ClaimReviewReader } from './ports/claim-review-reader';

/** What the caller supplies. */
export interface ReviewClaimRequest {
  readonly claimId: string;
}

/**
 * Assembles the administrator's claim review screen.
 */
export class ClaimReviewService {
  constructor(private readonly reader: ClaimReviewReader) {}

  /**
   * Assemble the review screen.
   *
   * @throws {NotFoundError} when no Claim carries that id.
   */
  async review(request: ReviewClaimRequest): Promise<ClaimReviewScreen> {
    const facts = await this.reader.readReviewFacts(request.claimId);

    if (!facts) {
      throw new NotFoundError('No claim with that id.');
    }

    return assembleClaimReview({
      claimId: facts.claim.claimId,
      claimStatus: facts.claim.status,
      reason: facts.claim.reason,
      identifyingDetails: facts.claim.identifyingDetails,
      dateLost: facts.claim.dateLost,
      submittedAt: facts.claim.submittedAt,
      item: facts.item,
      competingClaims: facts.competingClaims,
    });
  }

  /**
   * Whether the screen offers the decision actions.
   *
   * **A Claim that is no longer `Pending` has no decision action.** The
   * screen is still assembled — the recorded decision is shown instead — but
   * the actions are gone.
   */
  offersDecision(screen: ClaimReviewScreen): boolean {
    return reviewOffersDecision(screen);
  }
}
