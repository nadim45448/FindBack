/**
 * The Claim visibility reader port.
 *
 * Same contract as the report reader: the reader takes the **column set**,
 * never the viewer, so the `SELECT` list is derived from what the viewer may
 * see. The claimant's `reason` and `identifyingDetails` are FR-37 Sensitive
 * Fields, and a Found-report owner never receives them — so for that
 * column set they are absent from the SQL.
 *
 * The reader is also **scoped by the visible Claim ids**. A claimant never
 * receives another claimant's Claim — not its existence, not its thread — so
 * the scope is a parameter rather than something the implementation
 * re-derives.
 */

import type { ClaimRow, ProjectionColumn } from '@/domain/listings';

/** Reads Claims for a column set. */
export interface ClaimVisibilityReader {
  /**
   * Load the Claims for a report, scoped to the Claims the viewer may see.
   *
   * `visibleClaimIds` is the already-scoped set. An **empty array** means the
   * viewer may see **no** Claims, and the implementation must not fall back
   * to "all Claims for the report". `null` means "every Claim on this
   * report" — the Found-report owner and administrator scopes.
   */
  loadClaimsForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
    visibleClaimIds: readonly string[] | null,
  ): Promise<readonly ClaimRow[]>;
}
