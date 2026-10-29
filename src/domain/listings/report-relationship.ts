/**
 * The relationship — the facts that place a viewer in an FR-39 column.
 *
 * This is the projection's only input about *how* the viewer relates to the
 * report. It carries **facts, never permissions**: `hasClaim` says the viewer
 * submitted a Claim, and the resolver reads it to choose **which column** the
 * viewer holds — never to decide **what that column grants**.
 *
 * That distinction is the structural form of FR-39's "visibility never
 * unlocks as a side effect of submitting a Claim or Recovery Response"
 * (`EXPERIENCE.md` §11.4). Because a column's grant is a fixed property of
 * the matrix, and the relationship only selects a column, submitting a Claim
 * cannot change what any column contains.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The two report types. Decides which owner column applies.
 *
 * **Re-exported from `report-type.ts`, not redeclared here.** Bolt `006`
 * introduced the type in this file; bolt `007` gives it its own home
 * alongside the rest of the report's vocabulary. A second declaration would
 * be two definitions of the same concept that could drift — and the whole
 * point of a value object is that there is exactly one of it.
 */
export type { ReportType, REPORT_TYPES, isReportType } from './report-type';

import type { ReportType } from './report-type';

/**
 * The facts connecting a viewer to a report.
 *
 * Every field is either an identifier or a boolean equality. None of them is
 * a permission, and none of them comes from the client.
 */
export interface ReportRelationship {
  readonly reportId: string;
  readonly reportType: ReportType;
  /** The report's author. The reporter is the owner. */
  readonly reporterId: string;
  /** The viewer's account id. Null for an anonymous viewer. */
  readonly viewerId: string | null;
  /** True when the viewer authored the report. */
  readonly isReporter: boolean;
  /** True when the viewer submitted a Claim on this report. */
  readonly hasClaim: boolean;
  /** True when the viewer submitted a Recovery Response on this report. */
  readonly hasRecoveryResponse: boolean;
  /** The viewer's own Claim id, if any. */
  readonly claimId: string | null;
  /** The viewer's own Recovery Response id, if any. */
  readonly recoveryResponseId: string | null;
}

/** The fields a relationship is built from. */
export interface ReportRelationshipParams {
  readonly reportId: string;
  readonly reportType: ReportType;
  readonly reporterId: string;
  readonly viewerId: string | null;
  readonly claimId?: string | null;
  readonly recoveryResponseId?: string | null;
}

/**
 * Build a relationship.
 *
 * `isReporter` is computed **by equality** — never taken as a supplied flag.
 * A client-supplied "I am the owner" boolean would be a client-asserted
 * role, which PRD §3 forbids ("Roles are derived, never client-asserted").
 */
export function createReportRelationship(params: ReportRelationshipParams): ReportRelationship {
  const viewerId = params.viewerId;

  return {
    reportId: params.reportId,
    reportType: params.reportType,
    reporterId: params.reporterId,
    viewerId,
    isReporter: viewerId !== null && viewerId === params.reporterId,
    hasClaim: viewerId !== null && params.claimId != null,
    hasRecoveryResponse: viewerId !== null && params.recoveryResponseId != null,
    claimId: params.claimId ?? null,
    recoveryResponseId: params.recoveryResponseId ?? null,
  };
}
