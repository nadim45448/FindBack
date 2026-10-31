/**
 * The shared reading for the report form — §10.1, §10.3.
 *
 * ## The type is fixed by the URL, and the route decides it
 *
 * §10.1: *"The 'Lost' or 'Found' decision is encoded in the URL
 * (`/report/lost` vs `/report/found`). The form opens with the type
 * already chosen — the user does not need to pick it."* So the route knows
 * the type and passes it down; **no surface renders a type control.**
 *
 * ## The date bounds are the domain's
 *
 * §10.3: *"Date (Lost): last 365 days, not future"*; *"Date (Found): last
 * 30 days, not future"*. The domain owns both numbers — `dateMaxAgeDays`
 * reads them — and this module turns them into the `min` and `max` the
 * native date input enforces.
 *
 * **The bounds are a convenience, not the rule.** The server validates the
 * date again, so a request that bypasses the picker is still refused.
 *
 * ## The campus areas come from the deployment's configured set
 *
 * **The list is per-deployment external data** (ADR-20), and it is read
 * through the reader port. **A read failure is a refusal, never a
 * permissive default** — an empty set would reject every area, and a
 * fallback would accept every area.
 */

import {
  REPORT_CATEGORIES,
  dateMaxAgeDays,
  type ReportType,
} from '@/domain/listings';

import { PrismaCampusAreaReader } from '@/infrastructure/listings/prisma-campus-area-reader';
import { prisma } from '@/infrastructure/db/prisma';

import { SERVER_ERROR_MESSAGE } from '@/ui/member-copy';

/**
 * The form's opening reading.
 */
export interface ReportFormReading {
  /** The categories the deployment offers. */
  readonly categories: readonly string[];
  /** The campus areas the deployment offers (value + display label). */
  readonly campusAreas: readonly { readonly value: string; readonly label: string }[];
  /** The minimum date the native picker accepts. */
  readonly minDate: string;
  /** The maximum date the native picker accepts. */
  readonly maxDate: string;
}

/**
 * Read the report form's opening state.
 *
 * @returns the reading, or `null` when the campus-area list could not be
 * read — in which case the route shows the server-error message rather
 * than serving a form with no areas.
 */
export async function readReportForm(
  type: ReportType,
  today: Date = new Date(),
): Promise<ReportFormReading | null> {
  let campusAreas: readonly { value: string; label: string; active: boolean }[];

  try {
    campusAreas = await new PrismaCampusAreaReader(prisma).listActive();
  } catch {
    return null;
  }

  return {
    categories: REPORT_CATEGORIES,
    campusAreas: campusAreas.map((area) => ({
      value: area.value,
      label: area.label,
    })),
    ...dateBounds(type, today),
  };
}

/**
 * The native date picker's bounds.
 *
 * **The minimum is the earliest day the report may be dated,** and **the
 * maximum is today** — the report's date may not be in the future.
 */
export function dateBounds(
  type: ReportType,
  today: Date,
): { readonly minDate: string; readonly maxDate: string } {
  const maxAgeDays = dateMaxAgeDays(type);

  const earliest = new Date(today);
  earliest.setUTCDate(earliest.getUTCDate() - maxAgeDays);

  return {
    minDate: toDateInputValue(earliest),
    maxDate: toDateInputValue(today),
  };
}

/**
 * A date as the native input's `YYYY-MM-DD` value.
 */
function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export { SERVER_ERROR_MESSAGE };
