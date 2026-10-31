/**
 * The Recovery Response's date found — today or within the past 30 days,
 * never in the future.
 *
 * **The 30-day bound is the PRD's own, and it is a different number from the
 * Claim's 365 days.** FR-44 says *"Today or within the past 30 days, not
 * future"*; the Claim's date lost is bounded at 365 days. The two bounds
 * answer different questions — when did the item go missing (a Claim's
 * concern, which may be long ago) versus when did the responder find it (a
 * Response's concern, which cannot be, because the responder is describing
 * something they recently saw).
 *
 * **The bound is derived from the Found report's own bound, not restated.**
 * `FOUND_DATE_MAX_AGE_DAYS` is already 30 for exactly this reason — a Found
 * report's date is "the date the item was found", which is the same fact as a
 * Response's date found. A restatement would be a second number that could
 * drift from the first.
 *
 * **The comparison is by calendar day, and the bound is inclusive.** A date
 * exactly 30 days ago is accepted; one 31 days ago is not; tomorrow is not.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import {
  calendarDaysBetween,
  parseReportDate,
  utcCalendarDay,
  FOUND_DATE_MAX_AGE_DAYS,
} from '@/domain/listings';

/**
 * The date found's past bound, in days.
 *
 * **Origin:** FR-44 — "Date found | yes | date | Today or within the past 30
 * days, not future".
 *
 * **Derived from the Found report's bound** because the fact is the same one:
 * the day the item was found. The report's constant is the single
 * implementation point.
 */
export const RECOVERY_RESPONSE_DATE_FOUND_MAX_AGE_DAYS = FOUND_DATE_MAX_AGE_DAYS;

/**
 * A Recovery Response's date found, held as the UTC midnight of the calendar
 * day.
 *
 * **Branded, so a Response's date found is not interchangeable with a
 * report's date found** — even though they share the bound.
 */
export interface RecoveryResponseDateFound {
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
  readonly kind: 'recoveryResponseDateFound';
}

/**
 * Validate a submitted date as a Recovery Response's date found.
 *
 * @param value the submitted ISO calendar date, `YYYY-MM-DD`
 * @param today the current instant — **injected**, so "exactly 30 days ago"
 * is a testable assertion rather than a test that passes only on the right
 * day
 * @throws {ValidationError} when the value is not a date, is in the future,
 * or is older than 30 days
 */
export function validateRecoveryResponseDateFound(
  value: string,
  today: Date,
): RecoveryResponseDateFound {
  const parsed = parseReportDate(value);

  const todayDay = utcCalendarDay(today);
  const age = calendarDaysBetween(parsed.value, todayDay);

  if (age < 0) {
    throw new ValidationError('dateFound', 'The date found cannot be in the future.');
  }

  if (age > RECOVERY_RESPONSE_DATE_FOUND_MAX_AGE_DAYS) {
    throw new ValidationError(
      'dateFound',
      'The date found must be within the last 30 days.',
    );
  }

  return { value: parsed.value, isoDay: parsed.isoDay, kind: 'recoveryResponseDateFound' };
}
