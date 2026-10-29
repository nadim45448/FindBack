/**
 * The `ReportCreated` domain event.
 *
 * **One event, one shape, both types.** `report.created` is catalog event 1
 * and is the same event for a Lost and a Found report — the catalog's
 * required fields are `name`, `category`, `type`, `date`, `location`,
 * `optionalFields`, and `imagePresence`, and `type` carries the distinction.
 *
 * **The payload carries the presence of the optional Sensitive Fields, never
 * their values.** The catalog names **no** Sensitive Field for event 1, so
 * `exactPlace` and `identifyingDetails` must not appear as values on the
 * trail. The trail records *that* a report has identifying details, not
 * *what* they are.
 *
 * **`location` is the campus area, not the exact place.** The catalog names
 * one `location` field, and FR-39's matrix splits `campusArea` (public) from
 * `exactPlace` (Sensitive). Putting the exact place in `location` would put a
 * Sensitive Field on the trail under a name the catalog did not sanction, and
 * would let the trail reconstruct a location the matrix protects.
 *
 * **The event is raised after the transaction commits**, not from inside it.
 * An event for a report that may not exist is worse than a missing one — the
 * same reasoning ADR-7 gives for the audit-read record.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportCategory } from './report-category';
import type { ReportType } from './report-type';

/** The catalog type discriminator for event 1. */
export const REPORT_CREATED_EVENT_TYPE = 'report.created';

/** The presence flags for the optional Sensitive Fields. */
export interface ReportCreatedOptionalFields {
  /** Whether the report carries an exact place. Never the place itself. */
  readonly exactPlace: boolean;
  /** Whether the report carries identifying details. Never the details. */
  readonly identifyingDetails: boolean;
}

/** The `ReportCreated` event's payload. */
export interface ReportCreatedPayload {
  readonly name: string;
  readonly category: ReportCategory;
  readonly type: ReportType;
  /** The calendar day, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The campus area's enum value. Never the exact place. */
  readonly location: string;
  readonly optionalFields: ReportCreatedOptionalFields;
  readonly imagePresence: boolean;
}

/** The `ReportCreated` domain event. */
export interface ReportCreated {
  readonly type: typeof REPORT_CREATED_EVENT_TYPE;
  readonly reportId: string;
  readonly reporterId: string;
  readonly payload: ReportCreatedPayload;
}

/**
 * Build the `ReportCreated` event.
 *
 * The payload is assembled from the report's own fields, so an event cannot
 * carry a field the catalog does not name — the compiler is the check.
 */
export function buildReportCreatedEvent(report: {
  readonly id: string;
  readonly type: ReportType;
  readonly name: { readonly value: string };
  readonly category: ReportCategory;
  readonly date: { readonly isoDay: string };
  readonly campusArea: { readonly value: string };
  readonly exactPlace: unknown;
  readonly identifyingDetails: unknown;
  readonly imageRef: unknown;
  readonly reporterId: string;
}): ReportCreated {
  return {
    type: REPORT_CREATED_EVENT_TYPE,
    reportId: report.id,
    reporterId: report.reporterId,
    payload: {
      name: report.name.value,
      category: report.category,
      type: report.type,
      date: report.date.isoDay,
      location: report.campusArea.value,
      optionalFields: {
        exactPlace: report.exactPlace !== null && report.exactPlace !== undefined,
        identifyingDetails:
          report.identifyingDetails !== null && report.identifyingDetails !== undefined,
      },
      imagePresence: report.imageRef !== null && report.imageRef !== undefined,
    },
  };
}
