/**
 * The status view — which statuses a listing may return.
 *
 * **The status sets are type-aware, because the Found and Lost status sets
 * differ.** A Found report passes through `Claim Requested` and `Claim
 * Approved`; a Lost report passes through `Verification Pending`. FR-14
 * names the two available sets explicitly, and a filter that offered
 * `Verification Pending` on a Found report would be a combination that
 * cannot occur.
 *
 * **The default view differs by role.** A non-administrator's default
 * excludes `Returned` and `Closed` — the terminal statuses — and the member
 * can opt to include them. An administrator's default includes every
 * status, because an administrator is the one actor who moderates closed
 * reports.
 *
 * **`Verification Pending` is discoverable.** It is an *active* Lost-side
 * intermediate status, not a terminal one, and it appears in the default
 * view. This is stated in three separate places in the PRD (story 007's
 * acceptance criteria, story 009's, and story 011's) and it is the single
 * most likely status to be wrongly excluded — a list of "the interesting
 * statuses" that leaves out the one that means *something is in progress*.
 *
 * **The `mine` partition keeps the terminal statuses retrievable.** FR-49
 * says the owner sees their own reports "across all lifecycle statuses
 * including `Returned` and `Closed`". That is a deliberate difference from
 * the default view for other members' reports — and it is **not** a
 * contradiction of it. The default view is a *default*, not a limit: the
 * owner may opt into the terminal statuses, and under `mine` they may see
 * them without asking.
 *
 * Pure — no I/O, no framework imports.
 */

import { TERMINAL_REPORT_STATUSES, type ReportStatus } from './report-status';
import type { ReportType } from './report-type';
import type { ReportPartition } from './report-partition';

/**
 * The statuses a **Found** report may be in.
 *
 * The PRD's five, in lifecycle order.
 */
export const FOUND_STATUSES: readonly ReportStatus[] = Object.freeze([
  'Open',
  'Claim Requested',
  'Claim Approved',
  'Returned',
  'Closed',
]);

/**
 * The statuses a **Lost** report may be in.
 *
 * The PRD's four, in lifecycle order.
 */
export const LOST_STATUSES: readonly ReportStatus[] = Object.freeze([
  'Open',
  'Verification Pending',
  'Returned',
  'Closed',
]);

/**
 * The statuses available for a report type.
 *
 * **A Found report has no `Verification Pending` and a Lost report has no
 * `Claim Requested` or `Claim Approved`.** The two sets are disjoint apart
 * from `Open`, `Returned`, and `Closed` — and a filter that names a status
 * outside the report's type's set is refused rather than silently dropped.
 */
export function statusesForType(type: ReportType): readonly ReportStatus[] {
  return type === 'Found' ? FOUND_STATUSES : LOST_STATUSES;
}

/**
 * True when a status is available for a report type.
 *
 * The check is against the **type's own set**, not against the union. A
 * filter for `Verification Pending` combined with a `Found` type filter is
 * an invalid combination, and story 009 names it as such.
 */
export function statusAvailableForType(status: ReportStatus, type: ReportType): boolean {
  return statusesForType(type).includes(status);
}

/**
 * The statuses a **non-administrator** sees by default.
 *
 * Every status except the two terminal ones.
 *
 * **The union of the two type sets, deduplicated.** `Open`, `Returned`, and
 * `Closed` appear in both, so a naive concatenation would list them twice —
 * and a duplicated status in a filter's `IN` list is harmless to the
 * database but wrong as a description of the view.
 */
export function defaultStatusView(): readonly ReportStatus[] {
  return allStatuses().filter((status) => !TERMINAL_REPORT_STATUSES.includes(status));
}

/**
 * The statuses an **administrator** sees by default.
 *
 * Every status — the administrator is the one actor who moderates closed
 * reports, and FR-14 says so explicitly.
 */
export function administratorStatusView(): readonly ReportStatus[] {
  return allStatuses();
}

/**
 * Every status, deduplicated, in the PRD's lifecycle order.
 *
 * **The deduplication is the point.** The two type sets share three
 * statuses, and a view that listed a status twice would be describing
 * itself badly.
 */
function allStatuses(): readonly ReportStatus[] {
  return [...new Set<ReportStatus>([...FOUND_STATUSES, ...LOST_STATUSES])];
}

/**
 * The statuses a partition returns by default.
 *
 * **The `mine` partition returns every status.** The owner sees their own
 * reports across the whole lifecycle, including `Returned` and `Closed`,
 * without having to opt in — because a report they wrote is theirs to see
 * the end of.
 *
 * Every other partition uses the role's default: the terminal statuses are
 * excluded for a non-administrator and included for an administrator.
 */
export function defaultStatusViewFor(
  partition: ReportPartition,
  isAdministrator: boolean,
): readonly ReportStatus[] {
  if (partition === 'mine') {
    return administratorStatusView();
  }

  return isAdministrator ? administratorStatusView() : defaultStatusView();
}

/**
 * The statuses a partition returns, given an explicit filter.
 *
 * **An explicit filter is the caller's choice, and it is never widened.**
 * When the caller names statuses, those are the statuses — the default view
 * does not reappear underneath. The exception is the `mine` partition, whose
 * statuses are never restricted at all.
 *
 * @param partition the partition being listed.
 * @param isAdministrator whether the viewer is an administrator.
 * @param requested the caller's explicit status filter, or `null` for none.
 */
export function resolveStatusView(
  partition: ReportPartition,
  isAdministrator: boolean,
  requested: readonly ReportStatus[] | null,
): readonly ReportStatus[] {
  if (partition === 'mine') {
    return administratorStatusView();
  }

  if (requested !== null) {
    return requested;
  }

  return defaultStatusViewFor(partition, isAdministrator);
}
