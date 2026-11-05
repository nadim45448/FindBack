/**
 * The shared reading for the report edit form — §10.2.
 *
 * **The report is read through the FR-39 projection** — the same path as
 * item detail — and only the reporter receives an edit reading. A member
 * who is not the reporter gets `null`, indistinguishable from a missing
 * report.
 */

import type { ActorContext } from '@/domain/accounts';

import type { VisibilityProjection } from '@/domain/listings';

import type { ReportFormValues } from '@/ui/report-form-surface';

import { reporterActionPlan } from '../../../_reporter-actions';
import { readReportDetailForMember } from '../../_report-detail-reading';

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
 * Build form values from the projection the detail read already fetched.
 */
export function reportFormValuesFromProjection(
  projection: VisibilityProjection,
): ReportFormValues {
  const report = projection.report;

  return {
    name: report.name ?? '',
    category: report.category ?? '',
    description: report.description ?? '',
    date: report.date ?? '',
    campusArea: report.campusArea ?? '',
    exactPlace: report.exactPlace ?? '',
    identifyingDetails: report.identifyingDetails ?? '',
  };
}

/**
 * Read a report's current values for the edit form.
 *
 * @returns the reading, or `null` when the report is not visible to this
 * member as its reporter.
 */
export async function readReportForEdit(
  actor: ActorContext,
  reportId: string,
): Promise<ReportEditReading | null> {
  const detail = await readReportDetailForMember(actor, reportId);

  if (!detail || detail.plan === null) {
    return null;
  }

  const report = detail.projection.report;

  return {
    reportId: detail.projection.reportId,
    type: report.type,
    values: reportFormValuesFromProjection(detail.projection),
  };
}
