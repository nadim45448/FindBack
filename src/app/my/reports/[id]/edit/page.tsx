import type { Metadata } from 'next';
import Link from 'next/link';

import { asTerminalStatus, terminalEditMessage, type ReportStatus } from '@/domain/listings';

import { ReportFormPageShell } from '@/ui/report-form-page-shell';
import { ReportFormPanel } from '@/ui/report-form-panel';
import { MY_REPORTS_PAGE_TITLE } from '@/ui/member-copy';

import { requireMember } from '../../../_member-page';
import {
  campusAreasForForm,
  readReportForm,
  SERVER_ERROR_MESSAGE,
} from '../../../../report/_report-form-page';
import { readReportDetailForMember } from '../../_report-detail-reading';
import { reportFormValuesFromProjection } from './_report-edit-page';

export const metadata: Metadata = {
  title: 'Edit report',
};

/**
 * The report edit form — §10.2, §10.4, mockup `09-edit-report.html`.
 */
export default async function EditReportPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const actor = await requireMember(`/my/reports/${id}/edit`);

  const detail = await readReportDetailForMember(actor, id);

  if (!detail || detail.plan === null) {
    return <ReportNotFound />;
  }

  if (detail.plan.edit.kind === 'Blocked') {
    const status = detail.projection.report.status as ReportStatus;
    const terminal = asTerminalStatus(status);
    const message =
      terminal !== null && detail.plan.edit.reason === 'TerminalStatus'
        ? terminalEditMessage(terminal)
        : 'This report can no longer be edited.';

    return (
      <ReportFormPageShell type={detail.projection.report.type} editing>
        <div className="banner banner--warning" role="status">
          <p>
            <strong>{message}</strong>
          </p>
        </div>

        <p className="field__helper">
          <Link href={`/my/reports/${id}`}>{'Back to report'}</Link>
        </p>
      </ReportFormPageShell>
    );
  }

  const reading = await readReportForm(detail.projection.report.type);

  if (!reading) {
    return (
      <ReportFormPageShell type={detail.projection.report.type} editing>
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{SERVER_ERROR_MESSAGE}</p>
        </div>
      </ReportFormPageShell>
    );
  }

  return (
    <ReportFormPageShell type={detail.projection.report.type} editing>
      <ReportFormPanel
        type={detail.projection.report.type}
        initialValues={reportFormValuesFromProjection(detail.projection)}
        categories={reading.categories}
        campusAreas={campusAreasForForm(
          reading.campusAreas,
          detail.projection.report.campusArea,
        )}
        minDate={reading.minDate}
        maxDate={reading.maxDate}
        editing
        reportId={id}
      />
    </ReportFormPageShell>
  );
}

function ReportNotFound(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Report not found'}</h1>

      <p className="empty-view__body">
        {'That report could not be found. It may have been removed, or the link may be wrong.'}
      </p>

      <p className="field__helper">
        <Link href="/my/reports">{MY_REPORTS_PAGE_TITLE}</Link>
      </p>
    </div>
  );
}
