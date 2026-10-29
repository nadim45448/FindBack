/**
 * The listing result — the row shapes the four partitions return.
 *
 * **The three report partitions share one row shape, and the two
 * participation partitions share another.** A report row is a projected
 * report — the FR-39 projection's own output, narrowed to the columns the
 * listing resolved. A participation row is a Claim or a Recovery Response
 * plus the related report's **FR-38 summary fields**, the submission
 * timestamp, and a link to the per-participation thread.
 *
 * **The participation row carries the report's *summary* fields, never its
 * content.** A member's own Claim is visible to them; the report they
 * claimed on is someone else's, and they see it as an unrelated member
 * would — the summary set. The Claim's own private evidence (its `reason`,
 * its `identifyingDetails`) is theirs, because they wrote it.
 *
 * **The `previousValues` and `changedFields` are absent.** The audit trail
 * is administrator-only (FR-32), and a listing row is not a trail read.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportCategory } from './report-category';
import type { ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/**
 * A report, as a listing row.
 *
 * **The fields are the FR-38 summary set plus the identity of the row.**
 * `id` is needed for the link to the detail; `type` and `status` are
 * summary fields in their own right. The row carries **no** description, no
 * image reference, no exact place, no identifying details, and no reporter
 * identity — those belong to the detail projection, which resolves the
 * viewer's own columns.
 */
export interface ReportListingRow {
  readonly id: string;
  readonly type: ReportType;
  readonly status: ReportStatus;
  readonly name: string;
  readonly category: ReportCategory;
  /** The report's own date, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The campus area's enum value. */
  readonly campusArea: string;
}

/**
 * A Claim, as a listing row.
 *
 * **The Claim's own status and the related report's summary fields.** The
 * Claim's evidence — its `reason` and its `identifyingDetails` — is not
 * carried, because the listing row is a summary of the participation and
 * the evidence is on the detail view.
 */
export interface ClaimListingRow {
  readonly id: string;
  readonly status: string;
  /** The submission timestamp. */
  readonly submittedAt: string;
  /** The related Found report's summary fields. */
  readonly report: ReportListingRow;
  /** The per-Claim thread's link. */
  readonly threadId: string | null;
}

/**
 * A Recovery Response, as a listing row.
 *
 * **The canonical Recovery Response status** — FR-41's eight statuses, not
 * a shortened form.
 */
export interface RecoveryResponseListingRow {
  readonly id: string;
  readonly status: string;
  /** The submission timestamp. */
  readonly submittedAt: string;
  /** The related Lost report's summary fields. */
  readonly report: ReportListingRow;
  /** The per-Response thread's link. */
  readonly threadId: string | null;
}

/**
 * A page of results.
 *
 * **The total is a count of the whole filtered set, not of the page.** A
 * caller needs to know how many pages there are.
 */
export interface ListingPage<T> {
  /** The rows on this page. */
  readonly rows: readonly T[];
  /** The total number of rows the filter matches. */
  readonly total: number;
  /** The one-based page number. */
  readonly page: number;
  /** The rows per page. */
  readonly pageSize: number;
  /** The total number of pages, at least 1 — an empty set has one empty page. */
  readonly totalPages: number;
}

/**
 * Build a page of results.
 *
 * **An empty result set has one page, not zero.** A caller asking for page
 * 1 of an empty set gets an empty page, and a caller asking for page 2
 * gets an empty page too — rather than a division by zero in the page
 * count.
 */
export function listingPage<T>(
  rows: readonly T[],
  total: number,
  page: number,
  pageSize: number,
): ListingPage<T> {
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
