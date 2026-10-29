/**
 * The report's date — **one column, two domain meanings**.
 *
 * For a **Lost** report the date is the **date lost**; for a **Found**
 * report it is the **date found** (story 002's criterion 4: "the date field
 * records the date it was found, not the date it was lost"). The domain
 * names the two meanings `DateLost` and `DateFound`, while the storage keeps
 * one column. This is worth stating plainly because it is exactly the kind
 * of thing a later refactor would "tidy up" into two columns and break
 * FR-14's date filter — a row carrying both a date-lost and a date-found is
 * a state the domain has no meaning for.
 *
 * **The comparison is by calendar day.** A time component does not change the
 * verdict (story 003's edge case: "Date entered with a time component | The
 * date is compared by calendar day"). The date is therefore held as the
 * **UTC midnight** of the calendar day, and "today" is the UTC calendar day
 * of the injected clock.
 *
 * **The past bound is per type, and neither is relaxable.** Story 003: the
 * 365-day bound "is the current product rule (OQ-3) and is not relaxable or
 * configurable". Story 002: the 30-day bound "is the authoritative
 * requirement for Found reports and is not expanded or made configurable".
 * Neither is a setting; both are named constants carrying their origin, so
 * that changing one later is a **deliberate, visible** edit.
 *
 * **The bound is inclusive at the boundary.** "Date lost exactly 365 days
 * ago | Accepted; the bound is inclusive."
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import type { ReportType } from './report-type';

/**
 * The Lost report's past bound, in days.
 *
 * **Origin:** FR-6, story 001's edge cases, and story 003 — "a date more than
 * 365 days ago is rejected". The current product rule (OQ-3), explicitly not
 * relaxable and not configurable.
 */
export const LOST_DATE_MAX_AGE_DAYS = 365;

/**
 * The Found report's past bound, in days.
 *
 * **Origin:** FR-7, story 002 — "its date bound is the last 30 days ... the
 * 30-day past bound is the authoritative requirement for Found reports and is
 * not expanded or made configurable".
 */
export const FOUND_DATE_MAX_AGE_DAYS = 30;

/** The past bound, in days, for a report of the given type. */
export function dateMaxAgeDays(type: ReportType): number {
  switch (type) {
    case 'Lost':
      return LOST_DATE_MAX_AGE_DAYS;
    case 'Found':
      return FOUND_DATE_MAX_AGE_DAYS;
    default: {
      // **Exhaustive by construction.** `ReportType` has exactly two members,
      // so this branch is unreachable — and if a third type is ever added, the
      // compiler refuses to compile until the bound is stated for it. This is
      // the same discipline `coding-standards.md` requires for `ReportStatus`.
      const unreachable: never = type;
      throw new Error(`Unhandled report type: ${String(unreachable)}`);
    }
  }
}

/**
 * A report's date, held as the UTC midnight of the calendar day.
 *
 * @typeParam Kind - which kind of date this is. `DateLost` and `DateFound`
 * are different types, so a date that has passed the Lost bound cannot be
 * used where a Found date is expected.
 */
export interface ReportDate<Kind extends string = string> {
  /** The UTC midnight of the calendar day. */
  readonly value: Date;
  /** The calendar day, as `YYYY-MM-DD`. */
  readonly isoDay: string;
  /**
   * The date's kind.
   *
   * **Never read, never compared, never serialized.** It exists so the
   * compiler knows which date this is.
   */
  readonly kind: Kind;
}

/**
 * Parse a submitted date into a calendar day.
 *
 * The submitted value is an ISO calendar date, `YYYY-MM-DD`. A value with a
 * time component is **accepted and truncated to its calendar day**, because
 * the PRD's rule is that the date is compared by calendar day — rejecting a
 * valid date because it carries a time would be stricter than the
 * requirement.
 *
 * @throws {ValidationError} when the value is not a date.
 */
export function parseReportDate(value: string): ReportDate {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('date', 'Enter the date.');
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('date', 'Enter a valid date.');
  }

  // The calendar day is read in **UTC**, so the day never shifts with the
  // server's or the client's time zone.
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();

  const midnight = new Date(Date.UTC(year, month - 1, day));

  const isoDay = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { value: midnight, isoDay, kind: 'unvalidated' };
}

/**
 * The UTC calendar day of an instant.
 *
 * The same helper is used for "today", so the comparison and the parsed date
 * are on the same clock by construction.
 */
export function utcCalendarDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/**
 * The whole days between two calendar days.
 *
 * Both arguments are UTC midnights, so the difference is an exact number of
 * days — no hours, no time zone, no daylight-saving edge.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round((to.getTime() - from.getTime()) / millisecondsPerDay);
}

/**
 * The date lost — the date a Lost report's item went missing.
 *
 * **Branded, so a date-lost and a date-found are not interchangeable.**
 */
export type DateLost = ReportDate<'dateLost'>;

/**
 * The date found — the date a Found report's item was found.
 *
 * **Branded, so a date-found and a date-lost are not interchangeable.**
 */
export type DateFound = ReportDate<'dateFound'>;

/**
 * Validate a Lost report's date lost.
 *
 * @throws {ValidationError} when the date is in the future or older than 365
 * days.
 */
export function validateDateLost(value: ReportDate, today: Date): DateLost {
  validateDateWithinBounds(value, today, LOST_DATE_MAX_AGE_DAYS);

  return { value: value.value, isoDay: value.isoDay, kind: 'dateLost' };
}

/**
 * Validate a Found report's date found.
 *
 * @throws {ValidationError} when the date is in the future or older than 30
 * days.
 */
export function validateDateFound(value: ReportDate, today: Date): DateFound {
  validateDateWithinBounds(value, today, FOUND_DATE_MAX_AGE_DAYS);

  return { value: value.value, isoDay: value.isoDay, kind: 'dateFound' };
}

/**
 * The shared bound check.
 *
 * **The future check is strict** ("date lost tomorrow | Rejected") and **the
 * past check is inclusive** ("date lost exactly 365 days ago | Accepted").
 * The boundary is inclusive because the bound reads as "at most N days old",
 * and a report dated exactly 365 days ago is 365 days old.
 */
function validateDateWithinBounds(value: ReportDate, today: Date, maxAgeDays: number): void {
  const todayDay = utcCalendarDay(today);
  const age = calendarDaysBetween(value.value, todayDay);

  if (age < 0) {
    throw new ValidationError('date', 'The date cannot be in the future.');
  }

  if (age > maxAgeDays) {
    throw new ValidationError(
      'date',
      maxAgeDays === LOST_DATE_MAX_AGE_DAYS
        ? 'The date lost must be within the last 365 days.'
        : 'The date found must be within the last 30 days.',
    );
  }
}
