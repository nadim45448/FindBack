/**
 * The `Claim` entity and the `ClaimDraft` it is built from.
 *
 * **The Claim is the Found-side aggregate.** It is made against a **Found**
 * report by a member who believes the item is theirs, and it carries the
 * three fields that assert that belief: the reason, the identifying details,
 * and the date lost.
 *
 * **All three are required.** A Claim with a reason but no identifying
 * details asserts half a claim; the story says all three are validated
 * before any row is written, and a refused submission writes nothing.
 *
 * **The private evidence is FR-37 Sensitive, and the entity keeps it
 * separate.** `reason` and `identifyingDetails` are never granted to the
 * Found-report owner — that rule lives in the read projection
 * (`claim-projection.ts`), and this entity simply holds the values. The
 * split is structural: the type names the two private fields explicitly, so
 * a caller that wants to hand a Claim to the owner must say which fields it
 * is handing over.
 *
 * **The validator is the only path to a `Claim`**, exactly as
 * `report-field-validator.ts` is the only path to a `Report`. A Claim that
 * validated itself would have to exist before it could be validated.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ClaimDateLost } from './claim-date-lost';
import type { ClaimIdentifyingDetails } from './claim-identifying-details';
import type { ClaimReason } from './claim-reason';
import type { ClaimStatus } from './claim-status';

/**
 * The submitted fields, before validation.
 *
 * **Every field is a raw `string`.** The draft holds what the client sent;
 * the value objects hold what was accepted.
 *
 * **The shape is closed.** There is no index signature and no catch-all
 * field, so an unknown key in the request body has no way to reach this
 * type.
 */
export interface ClaimDraft {
  /** The Found report the Claim is made against. */
  readonly reportId: string;
  /** Why the item belongs to the claimant. */
  readonly reason: string;
  /** The details that identify the item. */
  readonly identifyingDetails: string;
  /** The calendar day the item went missing, `YYYY-MM-DD`. */
  readonly dateLost: string;
}

/** The fields a `ClaimDraft` is built from. */
export interface ClaimDraftParams {
  readonly reportId: string;
  readonly reason: string;
  readonly identifyingDetails: string;
  readonly dateLost: string;
}

/**
 * Build a draft.
 *
 * The fields are listed one by one, so a caller cannot smuggle an extra one
 * in.
 */
export function createClaimDraft(params: ClaimDraftParams): ClaimDraft {
  return {
    reportId: params.reportId,
    reason: params.reason,
    identifyingDetails: params.identifyingDetails,
    dateLost: params.dateLost,
  };
}

/**
 * A Claim against a Found report.
 *
 * The aggregate root of the Found-side interaction. Its `reportId` anchors
 * FR-39's visibility split — the Found-report owner and the claimant see
 * different Claims — and its `claimantId` is server-derived, never
 * client-asserted.
 */
export interface Claim {
  readonly id: string;
  /** The Found report the Claim is made against. */
  readonly reportId: string;
  /** The member who submitted the Claim. Server-derived. */
  readonly claimantId: string;
  readonly status: ClaimStatus;
  /** An FR-37 Sensitive Field. Never granted to the Found-report owner. */
  readonly reason: ClaimReason;
  /** An FR-37 Sensitive Field. Never granted to the Found-report owner. */
  readonly identifyingDetails: ClaimIdentifyingDetails;
  readonly dateLost: ClaimDateLost;
  /** When the Claim was submitted. `null` until it is. */
  readonly submittedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * The fields a validated `Claim` carries, **before it has an id**.
 *
 * The id is assigned by the repository, because an id is minted once and
 * `createdAt` records when the row was written — so the thing that is
 * validated is not the same shape as the thing that is stored.
 */
export interface ValidatedClaim {
  readonly reportId: string;
  readonly claimantId: string;
  readonly status: ClaimStatus;
  readonly reason: ClaimReason;
  readonly identifyingDetails: ClaimIdentifyingDetails;
  readonly dateLost: ClaimDateLost;
  readonly submittedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A Claim that has been persisted — the `ValidatedClaim` plus its id.
 *
 * The distinction is what makes "the id is minted once" true: the id is
 * absent from the validated shape and present on the persisted one, so it
 * cannot be supplied by a caller or invented by the domain.
 *
 * **The reason and the identifying details are nullable here, and only
 * here.** They are *required at submission* — the validator is the only
 * path to a `ValidatedClaim`, and it refuses a missing one — but a Claim
 * written by a **lifecycle path** (a withdrawal's auto-rejection, say) need
 * not carry them: it never went through the submission form. Reading such a
 * row back must not fail, so the persisted shape states the absence
 * explicitly rather than pretending the field was always there.
 */
export interface PersistedClaim
  extends Omit<ValidatedClaim, 'reason' | 'identifyingDetails'> {
  readonly id: string;
  /**
   * An FR-37 Sensitive Field. Never granted to the Found-report owner.
   *
   * `null` for a Claim that was never submitted through the form.
   */
  readonly reason: ClaimReason | null;
  /**
   * An FR-37 Sensitive Field. Never granted to the Found-report owner.
   *
   * `null` for a Claim that was never submitted through the form.
   */
  readonly identifyingDetails: ClaimIdentifyingDetails | null;
}
