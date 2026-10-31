/**
 * The `RecoveryResponse` entity and the `RecoveryResponseDraft` it is built
 * from.
 *
 * **The Recovery Response is the Lost-side aggregate.** It is made against a
 * **Lost** report by a member who believes they may have found the item, and
 * it carries the FR-44 field set: the campus area where it was found, the
 * optional exact-place text, the observed identifying details, the date
 * found, and an optional candidate image.
 *
 * **It is not a Claim, and the two are not interchangeable** (PRD §1, §4.4,
 * §4.12). A Claim says *"this is mine"*; a Recovery Response says *"I think
 * I found it"*. They have different field sets, different status vocabularies,
 * different selection rules, and different audit trails, and this module
 * shares no type with the Found side.
 *
 * **Multiple Recovery Responses on one Lost report are expected.** The
 * PRD's UJ-5 has two responders submit independently, and a third submit
 * during verification. So the entity carries no uniqueness claim of its own —
 * the one-non-terminal-per-responder rule is enforced by the gate and by a
 * partial unique index, not by the entity's shape.
 *
 * **The Sensitive Fields are held separately from the public ones.** The
 * exact place, the observed identifying details, and the candidate image are
 * FR-37 Sensitive Fields; the date found and the status are not. The split
 * is structural: the type names the sensitive fields explicitly, so a caller
 * that wants to hand a Response to another party must say which fields it is
 * handing over.
 *
 * **The validator is the only path to a `RecoveryResponse`**, exactly as
 * `report-field-validator.ts` is the only path to a `Report`. A Response
 * that validated itself would have to exist before it could be validated.
 *
 * Pure — no I/O, no framework imports.
 */

import type { CampusAreaValue } from '@/domain/listings/campus-area-value';
import type { RecoveryResponseStatus } from '@/domain/recovery/recovery-response-status';

import type { RecoveryResponseDateFound } from './recovery-response-date-found';
import type { RecoveryResponseObservedDetails } from './recovery-response-observed-details';
import type { RecoveryResponseWhereFound } from './recovery-response-where-found';

/**
 * The submitted fields, before validation.
 *
 * **Every field is a raw `string`.** The draft holds what the client sent;
 * the value objects hold what was accepted.
 *
 * **The shape is closed.** There is no index signature and no catch-all
 * field, so an unknown key in the request body has no way to reach this
 * type — the same mechanism that made the report's FR-8 field set closed.
 */
export interface RecoveryResponseDraft {
  /** The Lost report the Response is made against. */
  readonly reportId: string;
  /** The campus area where the item was found. */
  readonly campusArea: string;
  /** The exact place where the item was found. Optional. */
  readonly whereFoundExactPlace: string;
  /** The identifying details the responder observed. */
  readonly observedIdentifyingDetails: string;
  /** The calendar day the item was found, `YYYY-MM-DD`. */
  readonly dateFound: string;
}

/** The fields a `RecoveryResponseDraft` is built from. */
export interface RecoveryResponseDraftParams {
  readonly reportId: string;
  readonly campusArea: string;
  readonly whereFoundExactPlace: string;
  readonly observedIdentifyingDetails: string;
  readonly dateFound: string;
}

/**
 * Build a draft.
 *
 * The fields are listed one by one, so a caller cannot smuggle an extra one
 * in.
 */
export function createRecoveryResponseDraft(
  params: RecoveryResponseDraftParams,
): RecoveryResponseDraft {
  return {
    reportId: params.reportId,
    campusArea: params.campusArea,
    whereFoundExactPlace: params.whereFoundExactPlace,
    observedIdentifyingDetails: params.observedIdentifyingDetails,
    dateFound: params.dateFound,
  };
}

/**
 * A Recovery Response against a Lost report.
 *
 * The aggregate root of the Lost-side interaction. Its `reportId` anchors
 * FR-39's visibility split — the Lost-report owner and the responder see
 * different Responses — and its `responderId` is server-derived, never
 * client-asserted.
 */
export interface RecoveryResponse {
  readonly id: string;
  /** The Lost report the Response is made against. */
  readonly reportId: string;
  /** The member who submitted the Response. Server-derived. */
  readonly responderId: string;
  readonly status: RecoveryResponseStatus;
  /** The campus area where the item was found. Not sensitive. */
  readonly campusArea: CampusAreaValue;
  /** An FR-37 Sensitive Field. Never granted to an unrelated member. */
  readonly whereFoundExactPlace: RecoveryResponseWhereFound;
  /** An FR-37 Sensitive Field. Never granted to an unrelated member. */
  readonly observedIdentifyingDetails: RecoveryResponseObservedDetails;
  readonly dateFound: RecoveryResponseDateFound;
  /**
   * The candidate image's reference. **An FR-37 Sensitive Field.**
   *
   * `null` when the responder submitted no image — the field is optional.
   */
  readonly candidateImageRef: string | null;
  /** When the Response was submitted. */
  readonly submittedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * The fields a validated `RecoveryResponse` carries, **before it has an id**.
 *
 * The id is assigned by the repository, because an id is minted once and
 * `createdAt` records when the row was written — so the thing that is
 * validated is not the same shape as the thing that is stored.
 */
export interface ValidatedRecoveryResponse {
  readonly reportId: string;
  readonly responderId: string;
  readonly status: RecoveryResponseStatus;
  readonly campusArea: CampusAreaValue;
  readonly whereFoundExactPlace: RecoveryResponseWhereFound;
  readonly observedIdentifyingDetails: RecoveryResponseObservedDetails;
  readonly dateFound: RecoveryResponseDateFound;
  readonly candidateImageRef: string | null;
  readonly submittedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A Recovery Response that has been persisted.
 *
 * **The id is added, and the submission fields become nullable.** The id is
 * absent from the validated shape and present on the persisted one, so it
 * cannot be supplied by a caller or invented by the domain.
 *
 * **The submission fields are nullable because a lifecycle-written Response
 * genuinely has none.** A Response whose report was closed — resolving every
 * open response on it — was never submitted, so it carries no campus area, no
 * exact place, no observed details, and no date found. The columns are
 * nullable in the schema for exactly that reason, and the read has to be able
 * to say "absent" rather than fabricate an empty value or fail on one.
 *
 * **The validated shape stays non-nullable.** A Response that *was* submitted
 * carries all four fields, and the database's
 * `recovery_responses_submitted_fields_check` refuses a `Submitted` Response
 * that does not. So the two shapes differ where the storage differs, and a
 * caller reading a persisted Response knows that `null` means "never
 * submitted" rather than "submitted with nothing".
 */
export interface PersistedRecoveryResponse {
  readonly id: string;
  readonly reportId: string;
  readonly responderId: string;
  readonly status: RecoveryResponseStatus;
  /**
   * The campus area where the item was found.
   *
   * `null` on a Response that was never submitted.
   */
  readonly campusArea: CampusAreaValue | null;
  /**
   * An FR-37 Sensitive Field. Never granted to an unrelated member.
   *
   * `null` on a Response that was never submitted.
   */
  readonly whereFoundExactPlace: RecoveryResponseWhereFound | null;
  /**
   * An FR-37 Sensitive Field. Never granted to an unrelated member.
   *
   * `null` on a Response that was never submitted.
   */
  readonly observedIdentifyingDetails: RecoveryResponseObservedDetails | null;
  /**
   * The calendar day the item was found.
   *
   * `null` on a Response that was never submitted.
   */
  readonly dateFound: RecoveryResponseDateFound | null;
  /**
   * The candidate image's reference. **An FR-37 Sensitive Field.**
   *
   * `null` when no image was submitted — the field is optional.
   */
  readonly candidateImageRef: string | null;
  /** When the Response was submitted. `null` when it never was. */
  readonly submittedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
