/**
 * The **per-image delivery rule** — who may receive the *bytes* of a report
 * image.
 *
 * **This is narrower than the FR-39 field grant, and deliberately so.**
 *
 * The FR-39 matrix decides which *fields* a viewer's projection carries. The
 * `image` field is granted to every authenticated column — an unrelated
 * member, a claimant, and a recovery responder all receive the `imageRef`.
 * That is the PRD's § 4.11 table, and it is what the projection encodes.
 *
 * But a **reference is not the bytes**. `image-handling.md` §2 resolves the
 * read *per image*, and its table is strictly narrower:
 *
 * | Viewer | Image |
 * |---|---|
 * | Anonymous | Never |
 * | Unrelated Active member | Never |
 * | Report owner | Yes |
 * | Claimant on that Found report | No — an image is not ownership evidence |
 * | Recovery responder | Never — a responder must not see another candidate's image |
 * | Administrator | Yes — moderation and verification |
 *
 * So the two rules answer two different questions, and neither replaces the
 * other:
 *
 * - the **matrix** answers *may this viewer's projection carry the image
 *   reference*, and
 * - **this module** answers *may this viewer receive the image's bytes*.
 *
 * Reading the image is a read of externally stored bytes, and it is the one
 * read in the unit where a field-level grant is not sufficient — which is why
 * `image-handling.md` §2 gives the image its own table rather than deferring
 * to the matrix wholesale.
 *
 * **The rule is one implementation point.** Every path that serves image
 * bytes — the report image today, the Recovery Response candidate image in
 * Unit 004 — asks this function. A second copy of this table is a defect,
 * because a defect here is a privacy leak: a rule that is wrong in one
 * place and right in another leaks the bytes in the place it is wrong.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from './projection-column';
import type { ReportRelationship } from './report-relationship';
import type { Viewer } from './viewer';

/**
 * The columns whose holders may receive a report image's bytes.
 *
 * **The two owner columns and the administrator column.**
 *
 * The administrator column is included because moderation (FR-36) and
 * verification (FR-45) both require sight of the image. The two owner
 * columns are included because the reporter recognises their own item.
 *
 * **Not** the claimant column, **not** the recovery-responder column, and
 * **not** the unrelated-member column. Participation is never permission:
 * submitting a Claim or a Recovery Response must not unlock the image, and
 * an unrelated member's interest in an item must not either.
 */
export const IMAGE_DELIVERY_COLUMNS: readonly ProjectionColumn[] = [
  'foundReportOwner',
  'lostReportOwner',
  'administrator',
];

/**
 * True when the column set may receive a report image's bytes.
 *
 * **The columns are the decision, not the viewer.** The relationship is
 * already folded into the columns by the resolver, so a viewer holds
 * `foundReportOwner` only when they authored a Found report — and a viewer
 * who is both an administrator and a claimant holds `administrator` alone,
 * which grants everything.
 */
export function grantsImageDelivery(columns: readonly ProjectionColumn[]): boolean {
  return columns.some((column) => IMAGE_DELIVERY_COLUMNS.includes(column));
}

/**
 * Decide whether a viewer may receive a report image's bytes.
 *
 * **The relationship is checked as well as the columns.** The columns say
 * *what a position grants*; the relationship says *whether this viewer
 * holds that position on this report*. Reading both is what makes the rule
 * safe if a caller ever passes a column set resolved for a different
 * report — the relationship is the tie to the entity whose bytes are about
 * to be read.
 *
 * @param viewer the requester.
 * @param relationship the facts connecting the viewer to the report.
 * @param columns the columns the viewer holds on the report.
 */
export function mayReceiveImage(
  viewer: Viewer,
  relationship: ReportRelationship,
  columns: readonly ProjectionColumn[],
): boolean {
  // An anonymous viewer is refused before anything is loaded — but the
  // check is here too, so the rule is correct for any caller.
  if (viewer.kind === 'anonymous') {
    return false;
  }

  if (!grantsImageDelivery(columns)) {
    return false;
  }

  // **The administrator column is granted without an ownership tie.** An
  // administrator's authority follows from their role, not from a
  // relationship to the report.
  if (columns.includes('administrator')) {
    return true;
  }

  // **The owner columns require authorship.** A column set resolved for a
  // different report must not authorise this one.
  return relationship.isReporter;
}
