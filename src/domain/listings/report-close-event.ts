/**
 * The administrator's close event — catalog event 10.
 *
 * **The event already exists in the frozen catalog,** so this bolt adds no
 * event and no event number. Catalog event 10 is
 * `report.found_closed_by_administrator`, and it names exactly two fields:
 * `previousFoundStatus` and `closureReason`.
 *
 * **The payload carries exactly the two fields the catalog names.** The
 * audit payload sanitizer **denies by default**: a field the catalog does
 * not name is *refused*, not dropped, so the payload is typed to carry
 * exactly those two fields and the compiler is the check that it does.
 *
 * **The previous status is not incidental.** It is what makes the trail show
 * where the report was before it was closed, and it is one of the two
 * fields the catalog names for exactly this event.
 *
 * **The closure reason is the administrator's own words, verbatim.** It is
 * not softened. The softening rule of story 006 applies to the
 * *auto-rejection's* visible copy, not to an administrator's stated reason
 * for closing a report — and the reason is what an auditor reads to
 * understand why the report was closed.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ReportStatus } from './report-status';

/** The catalog type discriminator for event 10. */
export const REPORT_FOUND_CLOSED_BY_ADMINISTRATOR_EVENT_TYPE =
  'report.found_closed_by_administrator';

/**
 * The `ReportFoundClosedByAdministrator` event — catalog event 10.
 *
 * **The payload is exactly two fields:** the status the report was in
 * immediately before the close, and the administrator's reason.
 */
export interface ReportFoundClosedByAdministrator {
  readonly type: typeof REPORT_FOUND_CLOSED_BY_ADMINISTRATOR_EVENT_TYPE;
  readonly reportId: string;
  readonly administratorId: string;
  readonly payload: {
    readonly previousFoundStatus: ReportStatus;
    readonly closureReason: string;
  };
}

/**
 * Build the `ReportFoundClosedByAdministrator` event.
 *
 * @param previousStatus the status the report was in immediately before it
 * was closed
 * @param closureReason the administrator's reason, verbatim
 */
export function buildReportFoundClosedByAdministratorEvent(input: {
  readonly reportId: string;
  readonly administratorId: string;
  readonly previousStatus: ReportStatus;
  readonly closureReason: { readonly value: string };
}): ReportFoundClosedByAdministrator {
  return {
    type: REPORT_FOUND_CLOSED_BY_ADMINISTRATOR_EVENT_TYPE,
    reportId: input.reportId,
    administratorId: input.administratorId,
    payload: {
      previousFoundStatus: input.previousStatus,
      closureReason: input.closureReason.value,
    },
  };
}
