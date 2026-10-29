/**
 * The report type — `Lost` or `Found`.
 *
 * **One type, not two entities.** The two report types share the FR-8 field
 * set, the category enum, the validator, the status machine's shape, and the
 * FR-39 projection. They differ in exactly two things: the type label, and
 * the **date bound** (Lost ≤ 365 days, Found ≤ 30 days). Two entities would
 * mean two validators, two aggregate roots, two status machines, and two
 * FR-39 matrix columns — for a difference of one date constant.
 *
 * **The literals are the PRD's, verbatim** (coding-standards § Naming
 * conventions: "Status literals are named after the PRD, verbatim"). They are
 * never renamed.
 *
 * Pure — no I/O, no framework imports.
 */

/** A Lost or Found item report. */
export type ReportType = 'Lost' | 'Found';

/** Every report type, in a stable order. */
export const REPORT_TYPES: readonly ReportType[] = Object.freeze(['Lost', 'Found']);

/** True when `value` is one of the two report types. */
export function isReportType(value: string): value is ReportType {
  return value === 'Lost' || value === 'Found';
}
