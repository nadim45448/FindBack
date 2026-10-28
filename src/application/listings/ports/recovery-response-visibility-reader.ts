/**
 * The Recovery Response visibility reader port.
 *
 * Same contract as the Claim reader: the reader takes the **column set** and
 * the **already-scoped** set of visible response ids.
 *
 * The scope matters more here than anywhere else. A recovery responder sees
 * **only their own** response — other responders' responses, their
 * responder-supplied fields (where-found exact place, observed identifying
 * details, candidate image), and their threads are all absent. The Lost-report
 * owner sees every response on their own Lost report.
 */

import type { ProjectionColumn, RecoveryResponseRow } from '@/domain/listings';

/** Reads Recovery Responses for a column set. */
export interface RecoveryResponseVisibilityReader {
  /**
   * Load the Recovery Responses for a report, scoped to the responses the
   * viewer may see.
   *
   * `visibleResponseIds` is the already-scoped set. An **empty array** means
   * the viewer may see **no** responses. `null` means "every response on this
   * report" — the Lost-report owner and administrator scopes.
   */
  loadResponsesForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
    visibleResponseIds: readonly string[] | null,
  ): Promise<readonly RecoveryResponseRow[]>;
}
