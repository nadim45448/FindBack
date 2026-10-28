/**
 * The visibility resolver — the FR-39 matrix, as a pure function.
 *
 * `resolveColumns(viewer, relationship)` is the **single implementation point**
 * for "who may see what of this report". Every read path in FindBack inherits
 * it rather than re-deciding visibility, and this module is where a second
 * implementation would be a defect rather than a variant.
 *
 * **The resolver selects a column. It never decides what a column grants.**
 * The grants are constants of the matrix, defined in the projectors and in
 * the infrastructure's select builder. This is what makes FR-39's "visibility
 * never unlocks as a side effect of submitting a Claim or Recovery Response"
 * structural: submitting a Claim changes *which column* the viewer holds, and
 * a column's contents are fixed by the PRD, not by the viewer.
 *
 * Pure — no I/O, no framework imports.
 */

import { type ProjectionColumn } from './projection-column';
import type { ReportRelationship } from './report-relationship';
import type { Viewer } from './viewer';

/**
 * Resolve the FR-39 columns a viewer holds on a report.
 *
 * The rules, in order:
 *
 * 1 - An **anonymous** viewer holds `['anonymous']` and nothing else.
 * 2 - An **administrator** holds `['administrator']` and nothing else. The
 *     administrator column grants everything the other six grant, so
 *     resolving it alone is sufficient — the union would be redundant.
 * 3 - A member with **no** relationship holds `['unrelatedMember']`.
 * 4 - A member who **authored** the report holds the owner column for the
 *     report's type: `foundReportOwner` for a Found report,
 *     `lostReportOwner` for a Lost report. The type decides, because FR-39
 *     splits the owner columns and no member is ever both.
 * 5 - A member who **submitted a Claim** holds `claimant`.
 * 6 - A member who **submitted a Recovery Response** holds
 *     `recoveryResponder`.
 *
 * The owner column and the participation column **can** both be held. The
 * matrix does not forbid it; FR-15 forbids a member from claiming on their
 * own report, which is a workflow rule belonging to Unit 003, not a
 * visibility rule. If both were held, the union applies — which is exactly
 * the matrix's rule, and never wider than the matrix grants.
 */
export function resolveColumns(
  viewer: Viewer,
  relationship: ReportRelationship,
): readonly ProjectionColumn[] {
  if (viewer.kind === 'anonymous') {
    return ['anonymous'];
  }

  if (viewer.isAdministrator) {
    return ['administrator'];
  }

  const columns: ProjectionColumn[] = ['unrelatedMember'];

  if (relationship.isReporter) {
    columns.push(ownerColumnFor(relationship.reportType));
  }

  if (relationship.hasClaim) {
    columns.push('claimant');
  }

  if (relationship.hasRecoveryResponse) {
    columns.push('recoveryResponder');
  }

  return columns;
}

/**
 * The owner column for a report type.
 *
 * The split is FR-39's own: a Found-report owner has ownership only on Found
 * reports they authored; a Lost-report owner only on Lost reports they
 * authored.
 */
export function ownerColumnFor(
  reportType: ReportRelationship['reportType'],
): ProjectionColumn {
  return reportType === 'Found' ? 'foundReportOwner' : 'lostReportOwner';
}

/**
 * True when the column set grants the report-level Sensitive Fields.
 *
 * Only the two owner columns and the administrator column do. A claimant and
 * a recovery responder receive **no** report-level Sensitive Field — the
 * "participation is never permission" rule, stated as a predicate so the
 * projectors and the select builder cannot drift from it.
 */
export function grantsSensitiveFields(columns: readonly ProjectionColumn[]): boolean {
  return (
    columns.includes('foundReportOwner') ||
    columns.includes('lostReportOwner') ||
    columns.includes('administrator')
  );
}

/**
 * True when the column set grants the report content beyond the FR-38
 * summary set.
 *
 * Every column except `anonymous` does. An anonymous viewer is refused a
 * detail projection entirely, so the anonymous column never reaches a detail
 * projector.
 */
export function grantsReportContent(columns: readonly ProjectionColumn[]): boolean {
  return columns.some((column) => column !== 'anonymous');
}

/**
 * True when the column set grants the Claims.
 *
 * The claimant column (own Claim only), the Found-report owner column (the
 * Claims on their own Found report, without the private evidence), and the
 * administrator column (all Claims). The unrelated member, the anonymous
 * viewer, the recovery responder, and the Lost-report owner receive **no**
 * Claims at all.
 */
export function grantsClaims(columns: readonly ProjectionColumn[]): boolean {
  return (
    columns.includes('claimant') ||
    columns.includes('foundReportOwner') ||
    columns.includes('administrator')
  );
}

/**
 * True when the column set grants the Recovery Responses.
 *
 * The recovery responder column (own response only), the Lost-report owner
 * column (every response on their own Lost report), and the administrator
 * column. The unrelated member, the anonymous viewer, the Found-report owner,
 * and the claimant receive **no** responses at all.
 */
export function grantsRecoveryResponses(columns: readonly ProjectionColumn[]): boolean {
  return (
    columns.includes('recoveryResponder') ||
    columns.includes('lostReportOwner') ||
    columns.includes('administrator')
  );
}

/**
 * True when the column set grants the audit trail.
 *
 * **Administrators only.** No other column — not the reporter, not the
 * claimant, not the responder, not the Lost-report owner — ever receives any
 * part of the trail (FR-32; story 010 criterion 16).
 */
export function grantsAuditTrail(columns: readonly ProjectionColumn[]): boolean {
  return columns.includes('administrator');
}
