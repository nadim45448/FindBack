/**
 * The **per-image delivery rule** — who may receive the *bytes* of a report
 * image.
 *
 * **The rule follows the FR-39 field grant, with two participation
 * exceptions.**
 *
 * The visibility matrix grants the `image` field to every authenticated
 * viewer column except anonymous — including unrelated members browsing a
 * report. The detail surface renders that field as `<img
 * src="/api/reports/:id/image">`, so byte delivery must match the grant or
 * members see a broken image.
 *
 * **Participation is still not permission.** A claimant and a recovery
 * responder hold columns that carry the image *reference* in their
 * projection, but they must not receive the report image's *bytes* — an
 * image is not ownership evidence (Found), and a responder must not see
 * another candidate's context (Lost).
 *
 * | Viewer | Bytes |
 * |---|---|
 * | Anonymous | Never |
 * | Unrelated member (browse) | Yes — same as the `image` field grant |
 * | Report owner | Yes |
 * | Claimant on that Found report | No |
 * | Recovery responder on that Lost report | No |
 * | Administrator | Yes |
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from './projection-column';
import type { ReportRelationship } from './report-relationship';
import type { Viewer } from './viewer';

/**
 * Columns that can grant report image bytes when no participation column
 * blocks delivery.
 */
export const IMAGE_DELIVERY_COLUMNS: readonly ProjectionColumn[] = [
  'unrelatedMember',
  'foundReportOwner',
  'lostReportOwner',
  'administrator',
];

/**
 * Participation columns that block delivery even when `unrelatedMember` is
 * present.
 */
export const IMAGE_DELIVERY_BLOCKED_PARTICIPATION_COLUMNS: readonly ProjectionColumn[] = [
  'claimant',
  'recoveryResponder',
];

/**
 * True when the column set includes a column that can grant image bytes.
 *
 * **Claimant and recovery-responder columns veto delivery** — they are
 * checked here so callers that only inspect columns get the same answer as
 * `mayReceiveImage` for the participation cases.
 */
export function grantsImageDelivery(columns: readonly ProjectionColumn[]): boolean {
  if (
    IMAGE_DELIVERY_BLOCKED_PARTICIPATION_COLUMNS.some((column) => columns.includes(column))
  ) {
    return false;
  }

  return columns.some((column) => IMAGE_DELIVERY_COLUMNS.includes(column));
}

/**
 * Decide whether a viewer may receive a report image's bytes.
 */
export function mayReceiveImage(
  viewer: Viewer,
  relationship: ReportRelationship,
  columns: readonly ProjectionColumn[],
): boolean {
  if (viewer.kind === 'anonymous') {
    return false;
  }

  if (
    IMAGE_DELIVERY_BLOCKED_PARTICIPATION_COLUMNS.some((column) => columns.includes(column))
  ) {
    return false;
  }

  if (columns.includes('administrator')) {
    return true;
  }

  if (columns.includes('foundReportOwner') || columns.includes('lostReportOwner')) {
    return relationship.isReporter;
  }

  if (columns.includes('unrelatedMember')) {
    return true;
  }

  return false;
}
