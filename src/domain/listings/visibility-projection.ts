/**
 * The visibility projection — the viewer-scoped representation of a report.
 *
 * This is the aggregate root of the visibility bolt. It owns **visibility
 * decisions and nothing else**: it does not own the report, the Claims, the
 * Recovery Responses, the threads, or the trail — it owns the decision about
 * which of those the viewer may see. Those aggregates belong to their own
 * modules and are reached through ports.
 *
 * **Every inclusion in the projection is derivable from the column set
 * alone.** If a field cannot be derived from a column, it is not in the
 * projection. That is the invariant that makes the projection the single
 * implementation point.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportFieldSet } from './report-field-set';
import type { ProjectionColumn } from './projection-column';
import type { ReportType } from './report-relationship';

/**
 * The report, as the projection reads it.
 *
 * The fields are **optional**, because the projection's shape is what the
 * query is built from — a field absent from the projection was never
 * selected. The optionality is not "might be missing"; it is "was not
 * granted".
 */
export interface ProjectedReport {
  readonly id: string;
  readonly type: ReportType;
  readonly status: string;
  /** FR-38 summary. */
  readonly name?: string;
  readonly category?: string;
  readonly date?: string;
  readonly campusArea?: string;
  /** FR-39 authenticated-visible. */
  readonly description?: string;
  readonly imageRef?: string;
  readonly reporterDisplayName?: string;
  readonly statusHistory?: ProjectedStatusHistory;
  /** FR-37 sensitive. */
  readonly exactPlace?: string;
  readonly identifyingDetails?: string;
  readonly reporterEmail?: string;
  readonly reporterPhone?: string;
}

/**
 * The member-facing status history.
 *
 * **This is not the audit trail.** It is the report's current status plus the
 * timestamp of its most recent audit event — and nothing else. The event row
 * itself is never selected for a non-administrator, because an event row
 * carries the actor and the event type, which is trail content (FR-32).
 */
export interface ProjectedStatusHistory {
  readonly status: string;
  readonly lastActionAt: string | null;
}

/**
 * A Claim, as the viewer may see it.
 */
export interface ProjectedClaim {
  readonly claimId: string;
  readonly status: string;
  readonly submittedAt: string;
  /** FR-37 sensitive — the claimant and administrators only. */
  readonly reason?: string;
  readonly identifyingDetails?: string;
  readonly dateLost?: string;
  /** The claimant's own "audit-light history". Not the trail. */
  readonly auditLightHistory?: readonly AuditLightEntry[];
  /** True when this is the viewer's own Claim. */
  readonly isOwn: boolean;
}

/** One entry in a Claim's audit-light history. */
export interface AuditLightEntry {
  readonly status: string;
  readonly at: string;
}

/**
 * A Recovery Response, as the viewer may see it.
 */
export interface ProjectedRecoveryResponse {
  readonly responseId: string;
  readonly status: string;
  readonly submittedAt: string;
  /**
   * The campus area the responder says the item was found in.
   *
   * **FR-44's required where-found field, and not a Sensitive Field.** It
   * is the deployment's campus-area enum, so it is granted with the
   * response rather than behind FR-37's sensitive grant.
   */
  readonly campusArea?: string;
  /** FR-37 sensitive — the responder, the Lost-report owner, and administrators. */
  readonly whereFoundExactPlace?: string;
  readonly observedIdentifyingDetails?: string;
  readonly dateFound?: string;
  readonly candidateImageRef?: string;
  /** True when this is the viewer's own response. */
  readonly isOwn: boolean;
}

/** The kind of parent a thread hangs off. */
export type ThreadParentType = 'claim' | 'recovery_response';

/**
 * A thread, as the viewer may see it.
 *
 * **One thread per Recovery Response, never per Lost report.** A thread is
 * addressed by its parent, and the parent is what determines visibility.
 */
export interface ProjectedThread {
  readonly parentType: ThreadParentType;
  readonly parentId: string;
  readonly messages: readonly ProjectedThreadMessage[];
}

/** One message in a thread. */
export interface ProjectedThreadMessage {
  readonly id: string;
  readonly authorDisplayName: string;
  readonly body: string;
  readonly postedAt: string;
}

/**
 * The audit trail, as the viewer may see it.
 *
 * The trail is administrator-only. A member-facing projection carries
 * `null` here — an **explicit** absence, never an empty array, because
 * "forbidden" must be distinguishable from "empty" (ADR-8's rule).
 */
export type ProjectedAuditTrail = readonly unknown[] | null;

/**
 * The visibility projection — what a specific viewer may see of a specific
 * report.
 */
export interface VisibilityProjection {
  readonly reportId: string;
  /** The viewer's account id. Null for an anonymous viewer. */
  readonly viewerId: string | null;
  /** The FR-39 columns the viewer holds on this report. */
  readonly columns: readonly ProjectionColumn[];
  /** The report fields the viewer may see. */
  readonly reportFields: ReportFieldSet;
  readonly report: ProjectedReport;
  readonly claims: readonly ProjectedClaim[];
  readonly recoveryResponses: readonly ProjectedRecoveryResponse[];
  readonly threads: readonly ProjectedThread[];
  /** The trail, or an explicit `null` when the viewer may not have it. */
  readonly auditTrail: ProjectedAuditTrail;
}
