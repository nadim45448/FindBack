/**
 * The report visibility reader port.
 *
 * **The signature carries the authorisation decision.** The reader takes the
 * *resolved column set*, never the viewer — because a reader that took the
 * viewer would have to load the report to decide what to load, which is
 * precisely the defect FR-39 criterion 1 forbids ("the Sensitive Field is
 * never loaded at all, because filtering an already-loaded value after the
 * fact is not sufficient").
 *
 * Passing the columns puts the decision **upstream of the query**, so the
 * implementation can derive the `SELECT` list from the field set and a
 * Sensitive Field the viewer may not see is never read from the database.
 *
 * The port lives under `application/listings/ports/` rather than the shared
 * `application/ports/` because it is **the listings module's own capability**,
 * not a cross-cutting one — the same rule ADR-9 applied to the audit event
 * catalog.
 */

import type {
  ProjectionColumn,
  ReportRelationship,
  ReportRow,
} from '@/domain/listings';

/**
 * Reads a report and its relationship for a viewer.
 */
export interface ReportVisibilityReader {
  /**
   * Load a report's **relationship** facts for a viewer.
   *
   * Returns `null` when the report does not exist. The relationship is two
   * existence facts plus two ids, over indexed foreign keys; it is resolved
   * separately from the report read so the report's `SELECT` list depends on
   * the field set alone and never on join shape.
   *
   * **A viewer with no relationship still gets a relationship.** The
   * implementation uses `LEFT JOIN`s, so an unrelated member's row exists
   * with `isReporter: false` and no claim or response id — an inner join
   * would return nothing and make "not related" indistinguishable from "not
   * exist".
   */
  loadRelationship(reportId: string, viewerId: string | null): Promise<ReportRelationship | null>;

  /**
   * Load a report for a column set.
   *
   * The implementation selects **only** the fields the columns authorise.
   * A field outside the field set is absent from the SQL, not filtered out
   * of the result.
   *
   * Returns `null` when the report does not exist.
   */
  loadReportForViewer(
    reportId: string,
    columns: readonly ProjectionColumn[],
  ): Promise<ReportRow | null>;
}
