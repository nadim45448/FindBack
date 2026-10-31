/**
 * The `ClaimFieldValidator` — the **only** path to a `Claim`.
 *
 * **A pure function of the draft, the claimant, and the clock.** It takes
 * the submitted fields and returns either a validated claim or a
 * **field-level** error naming the offending field. No I/O, no database, no
 * network.
 *
 * **All three fields are validated before any row is written.** The story
 * says so: "All three fields are validated before any row is written; a
 * refused submission writes nothing to the Claim, the report, or the audit
 * trail". The validator returns one field error at a time — the first one
 * it finds — and the application layer writes nothing until it has a
 * validated claim, so a refused submission cannot leave a half-written row.
 *
 * **The clock is injected, never read from `new Date()`.** An injected clock
 * is what makes "exactly 365 days ago is accepted" a testable assertion
 * rather than a test that only passes on the right day.
 *
 * **The claimant is attached after the validation**, in the same shape
 * `report-field-validator.ts` uses: the claimant is a fact about the
 * *actor*, derived server-side, and never a request field.
 *
 * Pure — no I/O, no framework imports.
 */

import { validateClaimDateLost } from './claim-date-lost';
import { createClaimIdentifyingDetails } from './claim-identifying-details';
import { createClaimReason } from './claim-reason';
import type { ClaimStatus } from './claim-status';
import type { ClaimDraft, ValidatedClaim } from './claim';

/** The inputs the validator needs beyond the draft. */
export interface ClaimValidationContext {
  /**
   * The current instant, used to derive "today".
   *
   * **Injected, never read from the ambient clock.**
   */
  readonly now: Date;
}

/**
 * Validate a Claim submission.
 *
 * @returns the validated Claim's fields, ready to be persisted.
 * @throws {ValidationError} naming the offending field. The error carries
 * the **field name**, never the submitted value — the name is not sensitive,
 * the value might be (the reason and the identifying details are FR-37
 * Sensitive Fields).
 */
export function validateClaimDraft(
  draft: ClaimDraft,
  context: ClaimValidationContext,
): ValidatedClaim {
  const reason = createClaimReason(draft.reason);
  const identifyingDetails = createClaimIdentifyingDetails(draft.identifyingDetails);
  const dateLost = validateClaimDateLost(draft.dateLost, context.now);

  const createdAt = context.now;

  return {
    reportId: draft.reportId,
    // The claimant is attached by `withClaimant`; the validator leaves it
    // empty rather than accepting it from the draft.
    claimantId: '',
    // A new Claim is `Pending`. This bolt writes only `Pending` — the
    // administrator's approve and reject belong to bolt `016`.
    status: 'Pending' as ClaimStatus,
    reason,
    identifyingDetails,
    dateLost,
    // The Claim is submitted when it is created, so the two are the same
    // instant. `submitted_at` is nullable in the schema because a Claim row
    // may exist in a draft state that this bolt never writes.
    submittedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Attach the claimant to a validated Claim.
 *
 * **Separate from the validation**, because the claimant is a fact about
 * the *actor*, not about the submission — it is derived server-side and is
 * never a request field. Keeping it out of the draft is what makes that
 * structural.
 */
export function withClaimant(validated: ValidatedClaim, claimantId: string): ValidatedClaim {
  return { ...validated, claimantId };
}

/**
 * Re-exported so a caller that catches a field error has one import.
 *
 * `ValidationError` carries the field name, which is the whole of the
 * story's "a field-level validation error identifies the offending field".
 */
export { ValidationError } from '@/lib/errors';
