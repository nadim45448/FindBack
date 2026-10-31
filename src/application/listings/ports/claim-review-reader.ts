/**
 * The claim review reader port — story 002's assembled data.
 *
 * **One read assembles the whole screen.** The Claim, the item's details,
 * and the competing Claims are three tables, and the screen needs all
 * three. A reader that returned them separately would let the screen be
 * assembled from facts read at different moments — and a claim that was
 * `Pending` when the Claim was read but decided before the competitors were
 * read would produce a screen offering a decision action on a decided
 * Claim.
 *
 * **The competing-claim filtering is the reader's job, not the domain's.**
 * The rule "only `Pending` Claims count as competition" is a *query*
 * constraint — it is what makes the read cheap and the answer correct — and
 * the domain's job is to assemble what it is given and derive the count
 * from the list.
 *
 * **The claim's own evidence is here because an administrator is entitled
 * to it.** FR-37 and FR-39 permit an administrator to see the reason and
 * the identifying details. The route refuses a non-administrator *before*
 * this reader is called, so the evidence never leaves the administrator's
 * reach.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ClaimStatus } from '@/domain/listings';

/**
 * The claim's own evidence, as the review screen reads it.
 */
export interface ReviewClaimEvidence {
  readonly claimId: string;
  readonly status: ClaimStatus;
  readonly reportId: string;
  readonly reason: string;
  readonly identifyingDetails: string;
  /** The calendar day the item went missing, as `YYYY-MM-DD`. */
  readonly dateLost: string;
  readonly submittedAt: Date;
}

/**
 * The Found item's details, as the review screen reads them.
 */
export interface ReviewItemFacts {
  readonly name: string;
  readonly category: string;
  /** The calendar day, as `YYYY-MM-DD`. */
  readonly date: string;
  readonly campusArea: string;
}

/**
 * A competing `Pending` Claim, by reference.
 */
export interface ReviewCompetingClaim {
  readonly claimId: string;
  readonly submittedAt: Date;
}

/**
 * Everything the review screen needs, read together.
 */
export interface ClaimReviewFacts {
  readonly claim: ReviewClaimEvidence;
  readonly item: ReviewItemFacts;
  /** The *other* `Pending` Claims on the same item. */
  readonly competingClaims: readonly ReviewCompetingClaim[];
}

/**
 * Reads the administrator's claim review screen's data.
 */
export interface ClaimReviewReader {
  /**
   * Read the review screen's data.
   *
   * @returns the facts, or `null` when no Claim carries that id.
   */
  readReviewFacts(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<ClaimReviewFacts | null>;
}
