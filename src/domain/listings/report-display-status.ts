/**
 * Member-facing report status labels.
 *
 * **The stored Lost-report status stays `Verification Pending` until
 * Returned** — `Match Confirmed` lives on the Recovery Response. The UI
 * still needs a distinct label once the owner’s match is recorded.
 */

import type { ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/** Shown on Lost reports between match confirmation and Confirm Returned. */
export const LOST_REPORT_AWAITING_RETURN_STATUS = 'Awaiting return';

export function reportHasMatchConfirmed(
  responses: readonly { readonly status: string }[],
): boolean {
  return responses.some((response) => response.status === 'Match Confirmed');
}

/**
 * The status label members see on badges and tables.
 *
 * **Canonical status everywhere else** — filters, API, domain gates.
 */
export function displayReportStatus(
  type: ReportType,
  status: ReportStatus,
  options?: { readonly hasMatchConfirmed?: boolean },
): string {
  if (
    type === 'Lost' &&
    status === 'Verification Pending' &&
    options?.hasMatchConfirmed === true
  ) {
    return LOST_REPORT_AWAITING_RETURN_STATUS;
  }

  return status;
}
