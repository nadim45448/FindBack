/**
 * The seven FR-39 relationship columns.
 *
 * These are the PRD's, verbatim: FR-39 § 4.11 names seven viewer categories,
 * and this file is the closed set of them. **The names are never renamed**
 * (coding-standards § Naming conventions: role and status literals are named
 * after the PRD, character for character).
 *
 * **The set is closed, and that is the point.** An exhaustive switch over
 * `ProjectionColumn` is the compiler's check that no column was forgotten
 * when a new one is added — the same discipline `coding-standards.md` requires
 * for `ReportStatus` and `RecoveryResponseStatus`.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The FR-39 viewer categories.
 *
 * A viewer may hold **several** columns at once. The projection takes the
 * union of what those columns grant, and the union is bounded by the matrix:
 * a union is never wider than the matrix grants.
 */
export const PROJECTION_COLUMNS = [
  'anonymous',
  'unrelatedMember',
  'foundReportOwner',
  'claimant',
  'recoveryResponder',
  'lostReportOwner',
  'administrator',
] as const;

/** One of the seven FR-39 relationship columns. */
export type ProjectionColumn = (typeof PROJECTION_COLUMNS)[number];

/** True when the value is one of the seven columns. */
export function isProjectionColumn(value: string): value is ProjectionColumn {
  return (PROJECTION_COLUMNS as readonly string[]).includes(value);
}

/**
 * The columns that grant owner-level visibility on a report.
 *
 * A report has **exactly one** owner column, chosen by its type: a Found
 * report has a Found-report owner, a Lost report has a Lost-report owner.
 * FR-39's notes are explicit that there is no single "Report owner" column,
 * because no member is simultaneously the Found-report owner and the
 * Lost-report owner of the same report.
 */
export const OWNER_COLUMNS: readonly ProjectionColumn[] = [
  'foundReportOwner',
  'lostReportOwner',
];

/**
 * The columns that grant the Sensitive Fields.
 *
 * Only the two owner columns and the administrator column do. An unrelated
 * member, a claimant, and a recovery responder receive **no** report-level
 * Sensitive Field — which is the "participation is never permission" rule
 * made explicit as a set.
 */
export const SENSITIVE_GRANTING_COLUMNS: readonly ProjectionColumn[] = [
  'foundReportOwner',
  'lostReportOwner',
  'administrator',
];

/**
 * The columns that receive report content beyond the FR-38 summary set.
 *
 * Every column except `anonymous`. An anonymous viewer is refused a detail
 * projection entirely (FR-38: "There is NO anonymous report-detail page"),
 * so the anonymous column never reaches a detail projector.
 */
export const AUTHENTICATED_COLUMNS: readonly ProjectionColumn[] = [
  'unrelatedMember',
  'foundReportOwner',
  'claimant',
  'recoveryResponder',
  'lostReportOwner',
  'administrator',
];

/**
 * True when the column set includes the administrator column.
 *
 * The administrator column grants everything the other six grant, so it is
 * resolved **alone** rather than as a union (the Stage 1 design's Open
 * Question 3). Every administrator cell in the matrix is `Y`, so the union
 * would be redundant.
 */
export function grantsAdministrator(columns: readonly ProjectionColumn[]): boolean {
  return columns.includes('administrator');
}

/**
 * True when the column set includes an owner column.
 *
 * The owner columns are the only non-administrator grant of the report-level
 * Sensitive Fields.
 */
export function grantsOwnership(columns: readonly ProjectionColumn[]): boolean {
  return columns.some((column) => OWNER_COLUMNS.includes(column));
}
