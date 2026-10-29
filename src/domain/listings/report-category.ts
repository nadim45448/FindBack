/**
 * The report category — a **closed nine-value enum**, the PRD's, verbatim.
 *
 * **A closed set is a compile-time concern.** `ReportCategory` can only ever
 * hold one of the nine values, so no code path can construct one from
 * unvalidated input without going through `parseReportCategory`, which
 * rejects unknown values. A value outside the set is a **validation
 * rejection**, never a stored free-text value.
 *
 * `Other` is a legitimate choice and needs no qualifying text — that is the
 * PRD's edge case, not an oversight.
 *
 * **The category is compile-time while the campus area is injected**, and the
 * asymmetry is deliberate: the category set is fixed by the PRD and never
 * changes, while the campus-area list is per-deployment external data whose
 * configuration mechanism is ADR-20's.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** One of the nine fixed categories. */
export type ReportCategory =
  | 'Wallet'
  | 'Bag'
  | 'Electronics'
  | 'Keys'
  | 'Clothing'
  | 'Books/Notebooks'
  | 'Identification'
  | 'Water Bottle'
  | 'Other';

/**
 * The nine categories, in the PRD's order.
 *
 * The order is the PRD's, so the enumeration is stable and a test can assert
 * against it. `Object.freeze` means no caller can extend it — the set is
 * closed, and that is a property of the type, not a convention.
 */
export const REPORT_CATEGORIES: readonly ReportCategory[] = Object.freeze([
  'Wallet',
  'Bag',
  'Electronics',
  'Keys',
  'Clothing',
  'Books/Notebooks',
  'Identification',
  'Water Bottle',
  'Other',
]);

/** True when `value` is one of the nine categories. */
export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Parse a submitted category.
 *
 * @throws {ValidationError} when the value is outside the closed set.
 *
 * The error names the **field**, never the submitted value — the value might
 * itself be sensitive, and an error response must not echo one back.
 */
export function parseReportCategory(value: string): ReportCategory {
  if (isReportCategory(value)) {
    return value;
  }

  throw new ValidationError(
    'category',
    'Choose a category from the list of available categories.',
  );
}
