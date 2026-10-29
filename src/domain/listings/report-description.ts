/**
 * The report's description — 10–2000 characters, **inclusive** at both ends.
 *
 * A required field. The PRD's edge case is explicit: "Description of exactly
 * 10 or 2000 chars | Accepted; the bound is inclusive".
 *
 * Pure — no I/O, no framework imports.
 */

import { buildBoundedText, type BoundedText } from './bounded-text';

/** The inclusive bounds on a report's description. */
export const REPORT_DESCRIPTION_MIN_LENGTH = 10;
/** The inclusive bounds on a report's description. */
export const REPORT_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * A report's description.
 *
 * **Branded, so a description and a name are not interchangeable.** Both are
 * bounded text; only the brand tells them apart.
 */
export type ReportDescription = BoundedText<'description'>;

/**
 * Build a report's description.
 *
 * @throws {ValidationError} when the description is shorter than 10 or longer
 * than 2000 characters.
 */
export function createReportDescription(value: string): ReportDescription {
  return buildBoundedText(
    'description',
    value,
    REPORT_DESCRIPTION_MIN_LENGTH,
    REPORT_DESCRIPTION_MAX_LENGTH,
    'Describe the item in 10 to 2000 characters.',
    'description',
  );
}
