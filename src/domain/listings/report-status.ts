/**
 * The report's lifecycle status.
 *
 * **The literals are the PRD's, verbatim** (coding-standards § Naming
 * conventions: "Status literals are named after the PRD, verbatim"). They are
 * never renamed.
 *
 * **This bolt writes only `Open`.** The full FR-22 state machine — `Open`,
 * `Claim Requested`, `Claim Approved`, `Verification Pending`, `Returned`,
 * `Closed` — belongs to bolt `008` and Units 003/005. The statuses are
 * nevertheless modelled **now**, because the `reports.status` column carries
 * a CHECK constraint over the whole set, and a constraint over a partial set
 * would have to be altered the moment the machine grows.
 *
 * `Standby` is **never persisted** (FR-41, D7) — it is derived at render
 * time — and it is not a report status in any case.
 *
 * Pure — no I/O, no framework imports.
 */

/** A report's lifecycle status. */
export type ReportStatus =
  | 'Open'
  | 'Claim Requested'
  | 'Claim Approved'
  | 'Verification Pending'
  | 'Returned'
  | 'Closed';

/** Every report status, in lifecycle order. */
export const REPORT_STATUSES: readonly ReportStatus[] = Object.freeze([
  'Open',
  'Claim Requested',
  'Claim Approved',
  'Verification Pending',
  'Returned',
  'Closed',
]);

/**
 * The statuses a report can never leave.
 *
 * `Returned` and `Closed` are terminal: nothing is ever hard-deleted from
 * them, and they accept no further change (PRD §10 Retention).
 */
export const TERMINAL_REPORT_STATUSES: readonly ReportStatus[] = Object.freeze([
  'Returned',
  'Closed',
]);

/** True when `status` is one of the six canonical statuses. */
export function isReportStatus(value: string): value is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(value);
}

/** True when the status accepts no further change. */
export function isTerminalReportStatus(status: ReportStatus): boolean {
  return TERMINAL_REPORT_STATUSES.includes(status);
}
