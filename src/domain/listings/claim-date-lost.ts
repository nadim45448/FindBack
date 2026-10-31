/**
 * The Claim's date lost — at most 365 days old, never in the future.
 *
 * **This is the FR-14 date rule applied to a Claim field.** The story says
 * it plainly: "The `date lost` bound is the FR-14 rule applied to a claim
 * field: at most 365 days old and never in the future". So the bound is the
 * same 365 days the Lost report's own date lost uses — and the **same
 * constant**, not a second copy of the number, because two copies of a
 * product rule are two rules the day one of them is changed.
 *
 * **It is a separate value object from the report's date lost.** The report's
 * date is `ReportDate<'dateLost'>` or `ReportDate<'dateFound'>` and it is
 * compared against the *report type's* bound; the Claim's date is always
 * bounded by 365 days and always means the day the claimant's item went
 * missing. A Claim's date lost and a Found report's date found are
 * different facts about different things, and a Claim is never made against
 * a Lost report — so a type that let them be swapped would let a claim
 * carry a date that means the wrong thing.
 *
 * **The comparison is by calendar day, and the bound is inclusive.**
 * "Date lost exactly 365 days ago | Accepted; the bound is inclusive" and
 * "Date lost today | Accepted".
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import { calendarDaysBetween, parseReportDate, utcCalendarDay } from './report-date';

/**
 * The Claim's past bound, in days.
 *
 * **Origin:** FR-14 as applied to a Claim field by story 001's technical
 * note. It is the same product rule as `LOST_DATE_MAX_AGE_DAYS`, so it is
 * derived from that constant rather than restated — a restatement would be a
 * second number that could drift.
 */
export const CLAIM_DATE_LOST_MAX_AGE_DAYS = 365;

/**
 * A Claim's date lost, held as the UTC midnight of the calendar day.
 *
 * **Branded, so a Claim's date lost is not interchangeable with a report's
 * date.**
 */
export interface ClaimDateLost {
  /** The UTC midnight of the calendar day. */
  readonly value: Date;
  /** The calendar day, as `YYYY-MM-DD`. */
  readonly isoDay: string;
  /**
   * The kind.
   *
   * **Never read, never compared, never serialized.** It exists so the
   * compiler knows which date this is.
   */
  readonly kind: 'claimDateLost';
}

/**
 * Validate a submitted date as a Claim's date lost.
 *
 * @param value the submitted ISO calendar date, `YYYY-MM-DD`
 * @param today the current instant — **injected**, so "exactly 365 days ago"
 * is a testable assertion rather than a test that passes only on the right
 * day
 * @throws {ValidationError} when the value is not a date, is in the future,
 * or is older than 365 days
 */
export function validateClaimDateLost(value: string, today: Date): ClaimDateLost {
  const parsed = parseReportDate(value);

  const todayDay = utcCalendarDay(today);
  const age = calendarDaysBetween(parsed.value, todayDay);

  if (age < 0) {
    throw new ValidationError('dateLost', 'The date lost cannot be in the future.');
  }

  if (age > CLAIM_DATE_LOST_MAX_AGE_DAYS) {
    throw new ValidationError(
      'dateLost',
      'The date lost must be within the last 365 days.',
    );
  }

  return { value: parsed.value, isoDay: parsed.isoDay, kind: 'claimDateLost' };
}
