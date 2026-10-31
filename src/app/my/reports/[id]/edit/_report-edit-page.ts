/**
 * The shared reading for the report edit form — §10.2.
 *
 * ## The report is read through the projection
 *
 * **The edit form opens with the report's current values,** and those values
 * come from the FR-39 projection — not from a second read path. The reporter
 * holds the owner column, which grants the report's content fields, so the
 * projection carries them.
 *
 * **A member who may not edit this report sees the not-found page.** The
 * ownership check and the terminal-status block are the domain's — the
 * service decides — and the route does not re-derive them.
 */

import type { ActorContext } from '@/domain/accounts';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import type { ReportFormValues } from '@/ui/report-form-surface';

/**
 * The edit form's opening reading.
 */
export interface ReportEditReading {
  /** The report's id. */
  readonly reportId: string;
  /** The report's type — the edit does not change it. */
  readonly type: 'Lost' | 'Found';
  /** The report's current values. */
  readonly values: ReportFormValues;
}

/**
 * Read a report's current values for the edit form.
 *
 * @returns the reading, or `null` when the report is not visible to this
 * member at all.
 */
export async function readReportForEdit(
  actor: ActorContext,
  reportId: string,
): Promise<ReportEditReading | null> {
  const stack = buildListingsStack();

  const projection = await stack.details.show(actor, reportId).catch(() => null);

  if (!projection) {
    return null;
  }

  const report = projection.report;

  return {
    reportId: projection.reportId,
    type: report.type,
    values: {
      name: report.name ?? '',
      category: report.category ?? '',
      description: report.description ?? '',
      date: report.date ?? '',
      campusArea: report.campusArea ?? '',
      exactPlace: report.exactPlace ?? '',
      identifyingDetails: report.identifyingDetails ?? '',
    },
  };
}
