/**
 * The **per-image delivery rule** — who may receive the *bytes* of a report
 * image.
 *
 * **Report listing photos follow the authenticated browse grant.** EXPERIENCE.md
 * §6.3 grants the report `image` to unrelated members, claimants, and recovery
 * responders on the detail page. Byte delivery matches that grant: any member
 * who holds `unrelatedMember` on the report may load the listing photo, including
 * after they submit a Claim or Recovery Response.
 *
 * **Candidate images on Recovery Responses are a separate rule** — see
 * `candidate-image-delivery.ts`. A responder must not receive another
 * candidate's upload through that path.
 *
 * | Viewer | Bytes |
 * |---|---|
 * | Anonymous | Never |
 * | Authenticated member browsing the report | Yes |
 * | Report owner | Yes |
 * | Administrator | Yes |
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from './projection-column';
import type { ReportRelationship } from './report-relationship';
import type { Viewer } from './viewer';

/**
 * Columns that can grant report image bytes.
 */
export const IMAGE_DELIVERY_COLUMNS: readonly ProjectionColumn[] = [
  'unrelatedMember',
  'foundReportOwner',
  'lostReportOwner',
  'administrator',
];

/**
 * True when the column set includes a column that can grant image bytes.
 */
export function grantsImageDelivery(columns: readonly ProjectionColumn[]): boolean {
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
