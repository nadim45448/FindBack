/**
 * The report listing reader — the port for the FR-14 search pool.
 *
 * **The reader takes the resolved partition and filter, never the viewer.**
 * This is the same discipline bolt `006` applied to the visibility readers:
 * the authorisation decision is resolved *upstream* of the query, so the
 * query can be shaped by it. A reader that took the viewer would have to
 * re-decide the authorisation inside the query, and the two decisions
 * would drift.
 *
 * **The partition is in the query, not applied afterwards.** The `browse`
 * partition carries the viewer's own id as an *exclusion* — the reader
 * receives it as part of the partition's definition, so there is no code
 * path where the exclusion is forgotten. A listing that "loads browse and
 * then filters out my own reports" would be the load-then-filter defect
 * FR-39 names, applied to the partition rather than to a field.
 *
 * **The keyword is a parameter, never interpolated.** The reader receives
 * the keyword and binds it — the query builder's job is to make the value
 * a bind parameter, not a fragment of SQL.
 */

import type {
  ClaimListingRow,
  ListingPage,
  RecoveryResponseListingRow,
  ReportListingFilter,
  ReportListingRow,
  ReportPage,
  ReportPartition,
} from '@/domain/listings';

/** The reader for the report listings. */
export interface ReportListingReader {
  /**
   * List the reports of a partition.
   *
   * @param partition the resolved partition.
   * @param filter the resolved filter.
   * @param statuses the statuses the partition's status view permits.
   * @param viewerId the viewer's account id, or `null` for an anonymous
   * viewer. **It is the exclusion for `browse`** — the reader excludes
   * reports this id authored, which is what makes the partition disjoint
   * from `mine` by construction.
   * @param page the page to return.
   */
  listReports(
    partition: ReportPartition,
    filter: ReportListingFilter,
    statuses: readonly string[],
    viewerId: string | null,
    page: ReportPage,
  ): Promise<ListingPage<ReportListingRow>>;

  /**
   * List a member's Claims, with the related report's summary fields.
   *
   * @param viewerId the member's account id.
   * @param filter the resolved filter — applied to the **related report**,
   * because that is what the row shows.
   * @param statuses the statuses the related report must be in.
   * @param page the page to return.
   */
  listClaims(
    viewerId: string,
    filter: ReportListingFilter,
    statuses: readonly string[],
    page: ReportPage,
  ): Promise<ListingPage<ClaimListingRow>>;

  /**
   * List a member's Recovery Responses, with the related report's summary
   * fields.
   *
   * @param viewerId the member's account id.
   * @param filter the resolved filter — applied to the related report.
   * @param statuses the statuses the related report must be in.
   * @param page the page to return.
   */
  listRecoveryResponses(
    viewerId: string,
    filter: ReportListingFilter,
    statuses: readonly string[],
    page: ReportPage,
  ): Promise<ListingPage<RecoveryResponseListingRow>>;
}
