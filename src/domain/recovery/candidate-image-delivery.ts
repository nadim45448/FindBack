/**
 * The **per-image delivery rule** for a Recovery Response's *candidate
 * image* — who may receive the bytes.
 *
 * **This is the Lost-side sibling of `image-delivery.ts`, and it is a
 * separate rule because the entity is a different one.**
 *
 * The report image belongs to a *report*; the candidate image belongs to a
 * *Recovery Response*, which is a Lost-side aggregate with its own
 * participants. The two images have different viewers and different
 * consequences:
 *
 * | Viewer | Candidate image |
 * |---|---|
 * | Anonymous | Never |
 * | Unrelated Active member | Never |
 * | **The responding member** | **Yes — it is their own image** |
 * | The Lost-report owner | Yes — they must evaluate and select from the responses |
 * | Another responder on the same report | **Never — a responder must not see another candidate's image** |
 * | A claimant on that Lost report | **Never — a Claim is on the Found side, and participation is never permission** |
 * | Administrator | Yes — moderation and verification |
 *
 * **The "own image" grant is what the report rule deliberately withholds.**
 * A report's owner column and the administrator column grant the report
 * image's bytes; there is no "the member who uploaded it" case, because the
 * uploader *is* the report's owner. A candidate image is different — the
 * uploader is a responder, and the responder's image is their own
 * contribution, not the report's.
 *
 * **Why the responder's own image is granted.** The responder submitted it
 * as evidence of what they found; they are the only party who already has
 * the bytes, and refusing them their own upload would be refusing them their
 * own submission. That grant is *narrow*: it is for **this** response only,
 * and it does not extend to any other response on the same report.
 *
 * **The other responder's image is refused, and that is the load-bearing
 * part.** Two responders submit independently (PRD UJ-5), and each is a
 * candidate for the same item. Seeing the other candidate's image would
 * tell one responder what the other found — which is exactly the
 * cross-response isolation FR-39's notes draw ("The Lost-report owner is the
 * only non-administrator party with cross-response visibility on a Lost
 * report").
 *
 * **One implementation point.** Every path that serves candidate-image bytes
 * asks this function. A second copy of this table is a defect, because a
 * defect here is a privacy leak: a rule that is wrong in one place and
 * right in another leaks the bytes in the place it is wrong.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from '@/domain/listings/projection-column';
import type { Viewer } from '@/domain/listings/viewer';

/**
 * The facts connecting a viewer to a **Recovery Response**.
 *
 * **This is not the report's relationship.** The report's relationship answers
 * "who is this viewer in relation to the *report*"; this one answers "who is
 * this viewer in relation to *this Response*". A member can hold the
 * `recoveryResponder` column on a report while being a **competing**
 * responder for a different response on it — so the report-level column
 * alone cannot answer this question.
 *
 * **Every field is a fact, never a permission.** The reader derives them
 * from the stored rows; the client asserts none of them.
 */
export interface CandidateImageRelationship {
  /** The Response the image belongs to. */
  readonly responseId: string;
  /** The Lost report the Response was made against. */
  readonly reportId: string;
  /** The member who submitted the Response. */
  readonly responderId: string;
  /** The member who authored the Lost report. */
  readonly reportOwnerId: string;
  /** The viewer's account id. Null for an anonymous viewer. */
  readonly viewerId: string | null;
  /**
   * True when the viewer submitted **this** Response.
   *
   * **Not** "submitted some Response on this report" — that is a different
   * fact, and it is what the competing-responder refusal turns on.
   */
  readonly isResponder: boolean;
}

/**
 * The columns whose holders may receive a candidate image's bytes.
 *
 * **The Lost-report owner and the administrator.** The responder's own image
 * is granted by a separate rule — `mayReceiveCandidateImage` — because
 * "the responder" is not an FR-39 *column* but a relationship to a
 * particular response.
 *
 * **Not** `recoveryResponder` as a column: a responder holds that column on
 * the report, and the column says nothing about *which* response. A
 * competing responder holds the same column and must still be refused.
 *
 * **Not** `claimant`: a Claim lives on the Found side, and a claimant on a
 * Lost report is an unrelated member as far as this image is concerned.
 */
export const CANDIDATE_IMAGE_DELIVERY_COLUMNS: readonly ProjectionColumn[] = [
  'lostReportOwner',
  'administrator',
];

/**
 * True when the column set may receive a candidate image's bytes.
 *
 * **The columns are the decision for the owner and the administrator.** The
 * relationship below carries the responder's own case, which is not a
 * column.
 */
export function grantsCandidateImageDelivery(columns: readonly ProjectionColumn[]): boolean {
  return columns.some((column) => CANDIDATE_IMAGE_DELIVERY_COLUMNS.includes(column));
}

/**
 * Decide whether a viewer may receive a Recovery Response's candidate image
 * bytes.
 *
 * **The order is the rule.** The anonymous refusal comes first and reads
 * nothing; then the responder's own grant; then the owner and the
 * administrator.
 *
 * @param viewer the requester.
 * @param relationship the facts connecting the viewer to this Response.
 * @param columns the FR-39 columns the viewer holds on the response's report.
 */
export function mayReceiveCandidateImage(
  viewer: Viewer,
  relationship: CandidateImageRelationship,
  columns: readonly ProjectionColumn[],
): boolean {
  // An anonymous viewer is refused before anything is loaded — but the check
  // is here too, so the rule is correct for any caller.
  if (viewer.kind === 'anonymous') {
    return false;
  }

  // **The responder's own image.** Scoped to *this* response: the
  // relationship's `isResponder` is the equality of the viewer with this
  // response's responder, not with some other response on the same report.
  if (relationship.isResponder) {
    return true;
  }

  // **The Lost-report owner and the administrator.** The owner column
  // requires ownership of the report the response was made against, and the
  // administrator column follows from the role alone.
  if (columns.includes('administrator')) {
    return true;
  }

  if (columns.includes('lostReportOwner')) {
    // **The owner column requires authorship.** A column set resolved for a
    // different report must not authorise this one.
    return relationship.viewerId !== null && relationship.viewerId === relationship.reportOwnerId;
  }

  return false;
}
