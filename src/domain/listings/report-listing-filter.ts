/**
 * The FR-14 listing filter — the search and narrowing model.
 *
 * **The filter is a closed shape, and the keyword surface is exactly two
 * fields.** FR-14 says keyword matching is "a case-insensitive partial match
 * against name and description only"; it does **not** search exact place or
 * identifying details, both of which are FR-37 Sensitive Fields. A keyword
 * that would match a Sensitive Field matches nothing — the Sensitive Fields
 * are not in the search surface at all, so there is nothing for the keyword
 * to match against.
 *
 * **The location filter is on the campus area enum, never on exact place.**
 * This is not a convenience: filtering on exact-place free text would
 * require **loading** a Sensitive Field for actors not authorised to see it,
 * and loading it to filter it is precisely what FR-39 forbids. The campus
 * area is the only non-sensitive location field, and it is the only one the
 * filter may name.
 *
 * **The date range filters the report's own date field** — `date lost` for a
 * Lost report, `date found` for a Found report. It is a range on that
 * column, and it is the same column the default ordering uses.
 *
 * **The type filter defaults to both.** A caller who names no type gets
 * Lost and Found reports together, because the pool is a **search pool**
 * over both kinds (PRD constraint: no automatic matching — the combined pool
 * is not a pairing mechanism).
 *
 * **The status filter is type-aware**, and the check is against the
 * *report type's* set rather than the union. `Verification Pending` is a
 * Lost status only; `Claim Requested` and `Claim Approved` are Found
 * statuses only. A filter that names a status outside the selected type's
 * set is a **validation refusal**, not a silently-empty result — the caller
 * asked for a combination that cannot exist, and saying "no results" would
 * hide the mistake.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import { parseReportCategory, type ReportCategory } from './report-category';
import { isReportStatus, type ReportStatus } from './report-status';
import { isReportType, type ReportType } from './report-type';
import { statusAvailableForType } from './report-status-view';

/**
 * The keyword — a case-insensitive partial match against name and
 * description.
 *
 * **The empty keyword means "no keyword filter".** It is not a filter that
 * matches every report by accident; it is the absence of a filter.
 */
export type Keyword = string;

/** The maximum keyword length. */
export const MAX_KEYWORD_LENGTH = 200;

/**
 * A date range, inclusive at both ends.
 *
 * `from` and `to` are calendar days in `YYYY-MM-DD` form — the same shape
 * the report's own date field uses, because the filter is on that field.
 */
export interface DateRange {
  /** The earliest date, inclusive. `null` for unbounded. */
  readonly from: string | null;
  /** The latest date, inclusive. `null` for unbounded. */
  readonly to: string | null;
}

/**
 * The listing filter.
 *
 * **Every field is optional and independently absent.** A filter with
 * nothing set returns the whole pool under the status view, which is the
 * caller's other filters' business.
 */
export interface ReportListingFilter {
  /** The keyword, or `null` for no keyword filter. */
  readonly keyword: Keyword | null;
  /** The category, or `null` for all categories. */
  readonly category: ReportCategory | null;
  /** The campus area, or `null` for all areas. */
  readonly campusArea: string | null;
  /** The date range, or `null` for no date filter. */
  readonly dateRange: DateRange | null;
  /** The report type, or `null` for both. */
  readonly type: ReportType | null;
  /** The statuses, or `null` for the default status view. */
  readonly statuses: readonly ReportStatus[] | null;
  /**
   * The **participation's own** statuses, or `null` for no such filter.
   *
   * ## Why this is separate from `statuses`
   *
   * `statuses` filters the **report's** status. The `claims` and
   * `recovery_responses` partitions list *participations* — a Claim or a
   * Recovery Response — and each of those has its **own** status, which is
   * a different vocabulary from the report's:
   *
   * - A Claim's statuses are `Pending`, `Approved`, `Rejected`.
   * - A Recovery Response's statuses are FR-41's eight.
   *
   * §9.4's `My Claims` tabs are `Pending`, `Approved`, `Rejected` — the
   * **Claim's** status, not the report's. A Claim on a `Claim Requested`
   * report is still a `Pending` Claim, so filtering on the report's status
   * would answer a different question than the tab asks.
   *
   * **So the participation's status is its own filter,** and the reader
   * applies it to the participation table's own `status` column.
   *
   * The field is `null` for the report partitions, where it is meaningless.
   *
   * **The field is optional**, so a filter literal that predates it still
   * typechecks — and an absent field means no such filter, exactly like an
   * explicit `null`.
   */
  readonly participationStatuses?: readonly string[] | null;
}

/** The filter that matches everything — no narrowing at all. */
export function emptyFilter(): ReportListingFilter {
  return {
    keyword: null,
    category: null,
    campusArea: null,
    dateRange: null,
    type: null,
    statuses: null,
    participationStatuses: null,
  };
}

/**
 * Parse a submitted keyword.
 *
 * @throws {ValidationError} when the keyword is longer than the maximum.
 *
 * **The error never echoes the keyword.** A keyword could carry a Sensitive
 * Field's contents — a member searching for their own passport number — and
 * an error response must not put it back on the wire.
 */
export function parseKeyword(value: string): Keyword {
  const trimmed = value.trim();

  if (trimmed.length > MAX_KEYWORD_LENGTH) {
    throw new ValidationError(
      'keyword',
      `Search by up to ${MAX_KEYWORD_LENGTH} characters.`,
    );
  }

  return trimmed;
}

/**
 * Parse a submitted category.
 *
 * @throws {ValidationError} when the value is outside the closed set.
 *
 * **The category set has one implementation point.** This delegates to
 * `parseReportCategory` rather than repeating the membership test — a
 * second list of the nine categories would be a second answer to "what are
 * the categories", and the two could drift.
 */
export function parseFilterCategory(value: string): ReportCategory {
  return parseReportCategory(value);
}

/**
 * Parse a submitted report type.
 *
 * @throws {ValidationError} when the value is neither `Lost` nor `Found`.
 */
export function parseFilterType(value: string): ReportType {
  if (isReportType(value)) {
    return value;
  }

  throw new ValidationError('type', 'Choose either Lost or Found.');
}

/**
 * Parse a submitted status.
 *
 * @throws {ValidationError} when the value is not one of the six statuses.
 */
export function parseFilterStatus(value: string): ReportStatus {
  if (isReportStatus(value)) {
    return value;
  }

  throw new ValidationError('status', 'That status is not one of the available statuses.');
}

/**
 * Validate the **combination** of a type filter and a status filter.
 *
 * **The combination is validated, not silently narrowed.** Story 009 names
 * `Found` with `Verification Pending` as an invalid combination. A
 * filter that returned an empty result for it would look like "nothing
 * matched" — while the caller had made a mistake the product could have
 * named.
 *
 * @throws {ValidationError} naming the offending status.
 */
export function assertTypeStatusCombination(
  type: ReportType | null,
  statuses: readonly ReportStatus[] | null,
): void {
  if (type === null || statuses === null) {
    return;
  }

  for (const status of statuses) {
    if (!statusAvailableForType(status, type)) {
      throw new ValidationError(
        'status',
        `The status "${status}" does not apply to a ${type} report.`,
      );
    }
  }
}

/**
 * Parse a submitted date range.
 *
 * @throws {ValidationError} when either bound is not a `YYYY-MM-DD` day, or
 * when the range is inverted.
 *
 * **The bounds are inclusive.** A range of one day matches that day.
 */
export function parseDateRange(from: string | null, to: string | null): DateRange | null {
  if (from === null && to === null) {
    return null;
  }

  if (from !== null && !isCalendarDay(from)) {
    throw new ValidationError('from', 'Enter a valid date.');
  }

  if (to !== null && !isCalendarDay(to)) {
    throw new ValidationError('to', 'Enter a valid date.');
  }

  if (from !== null && to !== null && from > to) {
    throw new ValidationError('from', 'The start date must not be after the end date.');
  }

  return { from, to };
}

/**
 * True when `value` is a `YYYY-MM-DD` calendar day.
 *
 * **The shape, and the month and day ranges — but not the calendar.** The
 * shape alone would accept `2026-13-01`, which is not a month; the range
 * check refuses it here, where the caller can be told which field was
 * wrong. `2026-02-31` still passes — the day exists in the shape sense but
 * not in February — because PostgreSQL's `date` type rejects it and a query
 * against an impossible date is not a disclosure. The alternative, a
 * hand-rolled calendar check, would be a second implementation of a rule
 * the database already holds.
 */
function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}
