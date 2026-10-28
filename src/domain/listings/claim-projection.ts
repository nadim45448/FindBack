/**
 * The Claim projector — builds the Claim projections for a column set.
 *
 * The Found-report owner and the claimant see **different** Claims with
 * **different** fields, and that difference is the substance of FR-39:
 *
 * - The **claimant** sees their own Claim in full — reason, identifying
 *   details, date lost, status, audit-light history.
 * - The **Found-report owner** sees that a Claim exists, its status, and its
 *   submission time — but **never** the claimant's reason or identifying
 *   details. Those are FR-37 Sensitive Fields, visible only to the claimant
 *   and administrators.
 * - The **administrator** sees every Claim in full.
 * - Everyone else sees **no Claims at all**.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ProjectionColumn } from './projection-column';
import type { AuditLightEntry, ProjectedClaim } from './visibility-projection';

/**
 * A Claim, as read from storage.
 *
 * The Sensitive fields are optional for the same reason the report's are:
 * the read is shaped by the column set.
 */
export interface ClaimRow {
  readonly id: string;
  readonly reportId: string;
  readonly claimantId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly reason?: string | null;
  readonly identifyingDetails?: string | null;
  readonly dateLost?: string | null;
  readonly auditLightHistory?: readonly AuditLightEntry[];
}

/**
 * Project the Claims for a column set.
 *
 * The viewer's own Claim id scopes the claimant's view. A claimant never
 * receives another claimant's Claim — not its existence, not its thread.
 */
export function projectClaims(
  rows: readonly ClaimRow[],
  columns: readonly ProjectionColumn[],
  ownClaimId: string | null,
): readonly ProjectedClaim[] {
  if (!columns.includes('claimant') && !columns.includes('foundReportOwner') && !columns.includes('administrator')) {
    return [];
  }

  const isAdministrator = columns.includes('administrator');
  const isClaimant = columns.includes('claimant');

  return rows.map((row) => {
    const isOwn = ownClaimId !== null && row.id === ownClaimId;

    const projected: {
      claimId: string;
      status: string;
      submittedAt: string;
      reason?: string;
      identifyingDetails?: string;
      dateLost?: string;
      auditLightHistory?: readonly AuditLightEntry[];
      isOwn: boolean;
    } = {
      claimId: row.id,
      status: row.status,
      submittedAt: row.submittedAt,
      isOwn,
    };

    // The private evidence is granted in exactly two cases: the claimant on
    // their own Claim, and an administrator on any Claim.
    const seesEvidence = (isClaimant && isOwn) || isAdministrator;

    if (seesEvidence) {
      if (row.reason !== null && row.reason !== undefined) {
        projected.reason = row.reason;
      }

      if (row.identifyingDetails !== null && row.identifyingDetails !== undefined) {
        projected.identifyingDetails = row.identifyingDetails;
      }
    }

    if (seesEvidence && row.dateLost !== null && row.dateLost !== undefined) {
      projected.dateLost = row.dateLost;
    }

    // The audit-light history is the claimant's own status history. It is
    // **not** the trail, and it never confers trail access (FR-32).
    if (seesEvidence && row.auditLightHistory && row.auditLightHistory.length > 0) {
      projected.auditLightHistory = row.auditLightHistory;
    }

    return projected;
  });
}

/**
 * The Claims a column set may see, filtered to the viewer's own.
 *
 * The Found-report owner sees every Claim on their own Found report. A
 * claimant sees only their own. An administrator sees all.
 */
export function visibleClaimIds(
  rows: readonly ClaimRow[],
  columns: readonly ProjectionColumn[],
  ownClaimId: string | null,
): readonly string[] {
  if (columns.includes('administrator') || columns.includes('foundReportOwner')) {
    return rows.map((row) => row.id);
  }

  if (columns.includes('claimant') && ownClaimId !== null) {
    return rows.filter((row) => row.id === ownClaimId).map((row) => row.id);
  }

  return [];
}
