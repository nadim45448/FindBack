/**
 * The `RecoveryResponseFieldValidator` — the **only** path to a
 * `RecoveryResponse`.
 *
 * **A pure function of the draft, the responder, the campus areas, and the
 * clock.** It takes the submitted fields and returns either a validated
 * response or a **field-level** error naming the offending field. No I/O, no
 * database, no network.
 *
 * **All the fields are validated before any row is written.** The story says
 * so: a refused submission "writes nothing to the Claim, the report, or the
 * audit trail" — and the same holds for a Response. The validator returns
 * one field error at a time — the first one it finds — and the application
 * layer writes nothing until it has a validated response, so a refused
 * submission cannot leave a half-written row.
 *
 * **The clock is injected, never read from `new Date()`.** An injected clock
 * is what makes "exactly 30 days ago is accepted" a testable assertion
 * rather than a test that only passes on the right day.
 *
 * **The campus area is validated against the deployment's active set**, by
 * the same `createCampusAreaValue` the report's own campus area uses — the
 * two are the same enumeration, and a Response's area is one of the
 * deployment's configured areas (FR-44).
 *
 * **The responder is attached after the validation**, in the same shape
 * `claim-field-validator.ts` uses: the responder is a fact about the
 * *actor*, derived server-side, and never a request field.
 *
 * Pure — no I/O, no framework imports.
 */

import { createCampusAreaValue, type CampusArea } from '@/domain/listings/campus-area-value';
import type { RecoveryResponseStatus } from '@/domain/recovery/recovery-response-status';

import { validateRecoveryResponseDateFound } from './recovery-response-date-found';
import { createRecoveryResponseObservedDetails } from './recovery-response-observed-details';
import { createRecoveryResponseWhereFound } from './recovery-response-where-found';
import type {
  RecoveryResponseDraft,
  ValidatedRecoveryResponse,
} from './recovery-response';

/** The inputs the validator needs beyond the draft. */
export interface RecoveryResponseValidationContext {
  /**
   * The current instant, used to derive "today".
   *
   * **Injected, never read from the ambient clock.**
   */
  readonly now: Date;
  /**
   * The deployment's active campus areas.
   *
   * **Injected, never hard-coded** — the set is per-deployment external data
   * (ADR-20), and the same set the report's own validator uses.
   */
  readonly campusAreas: readonly CampusArea[];
}

/**
 * Validate a Recovery Response submission.
 *
 * @returns the validated Response's fields, ready to be persisted.
 * @throws {ValidationError} naming the offending field. The error carries
 * the **field name**, never the submitted value — the name is not sensitive,
 * the value might be (the exact place, the observed identifying details, and
 * the candidate image are FR-37 Sensitive Fields).
 */
export function validateRecoveryResponseDraft(
  draft: RecoveryResponseDraft,
  context: RecoveryResponseValidationContext,
): ValidatedRecoveryResponse {
  const campusArea = createCampusAreaValue(draft.campusArea, context.campusAreas);
  const whereFoundExactPlace = createRecoveryResponseWhereFound(draft.whereFoundExactPlace);
  const observedIdentifyingDetails = createRecoveryResponseObservedDetails(
    draft.observedIdentifyingDetails,
  );
  const dateFound = validateRecoveryResponseDateFound(draft.dateFound, context.now);

  const createdAt = context.now;

  return {
    reportId: draft.reportId,
    // The responder is attached by `withResponder`; the validator leaves it
    // empty rather than accepting it from the draft.
    responderId: '',
    // A new Recovery Response is always `Submitted`. The status machine
    // belongs to bolt 011 and the transitions to bolt 017; this bolt writes
    // only the creation.
    status: 'Submitted' as RecoveryResponseStatus,
    campusArea,
    whereFoundExactPlace,
    observedIdentifyingDetails,
    dateFound,
    // The candidate image is optional, and the reference is attached by the
    // application layer once the blob has been stored.
    candidateImageRef: null,
    // The Response is submitted when it is created, so the two are the same
    // instant.
    submittedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Attach the responder to a validated Recovery Response.
 *
 * **Separate from the validation**, because the responder is a fact about
 * the *actor*, not about the submission — it is derived server-side and is
 * never a request field. Keeping it out of the draft is what makes that
 * structural.
 */
export function withResponder(
  validated: ValidatedRecoveryResponse,
  responderId: string,
): ValidatedRecoveryResponse {
  return { ...validated, responderId };
}

/**
 * Attach the stored candidate image's reference to a validated Response.
 *
 * **Separate from the validation, because the reference does not exist until
 * the blob has been stored.** The image is written before the row (the
 * compensating write of image-handling §5), so the reference is known by the
 * time the row is written — but it is not a *submitted field*, and folding it
 * into the validator would let a caller name a blob that was never stored.
 */
export function withCandidateImage(
  validated: ValidatedRecoveryResponse,
  candidateImageRef: string | null,
): ValidatedRecoveryResponse {
  return { ...validated, candidateImageRef };
}

/**
 * Re-exported so a caller that catches a field error has one import.
 *
 * `ValidationError` carries the field name, which is the whole of the
 * story's "a field-level validation error identifies the offending field".
 */
export { ValidationError } from '@/lib/errors';
