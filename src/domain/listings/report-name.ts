/**
 * The report's name — 1–80 characters, **inclusive** at both ends.
 *
 * A required field. Whitespace-only is rejected, because the minimum length
 * is not met by whitespace.
 *
 * Pure — no I/O, no framework imports.
 */

import { buildBoundedText, type BoundedText } from './bounded-text';

/** The inclusive bounds on a report's name. */
export const REPORT_NAME_MIN_LENGTH = 1;
/** The inclusive bounds on a report's name. */
export const REPORT_NAME_MAX_LENGTH = 80;

/**
 * A report's name.
 *
 * **Branded, so a name and a description are not interchangeable.** Both are
 * bounded text; only the brand tells them apart.
 */
export type ReportName = BoundedText<'name'>;

/**
 * Build a report's name.
 *
 * @throws {ValidationError} when the name is empty, whitespace-only, or
 * longer than 80 characters.
 */
export function createReportName(value: string): ReportName {
  return buildBoundedText(
    'name',
    value,
    REPORT_NAME_MIN_LENGTH,
    REPORT_NAME_MAX_LENGTH,
    'Give the item a name of 1 to 80 characters.',
    'name',
  );
}
