import type { Metadata } from 'next';

import { ReportFormPanel } from '@/ui/report-form-panel';

import { requireMember } from '../../../_member-page';
import { readReportForm, SERVER_ERROR_MESSAGE } from '../../../../report/_report-form-page';
import { readReportForEdit } from './_report-edit-page';

export const metadata: Metadata = {
  title: 'Edit report',
};

/**
 * The report edit form — §10.2, §10.4.
 *
 * ## The type does not change
 *
 * §10.1 encodes the type in the URL and forbids toggling it. **An edit
 * changes the report's content, not its type** — so the form is opened with
 * the report's own type, and the edit request carries no type at all. The
 * edit parser drops it even if a client sent one.
 *
 * ## The report is read through the projection
 *
 * **The form opens with the report's current values,** and they come from
 * the FR-39 projection — the same read the detail page uses. The reporter
 * holds the owner column, so the projection carries the content fields.
 *
 * ## The date bounds are the report's own type's bounds
 *
 * A Lost report keeps the 365-day bound and a Found report keeps the
 * 30-day bound. **An edit does not relax the bound** — the report is still
 * the type it was created as.
 */
export default async function EditReportPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const actor = await requireMember(`/my/reports/${id}/edit`);

  const report = await readReportForEdit(actor, id);

  if (!report) {
    return <ReportNotFound />;
  }

  const reading = await readReportForm(report.type);

  if (!reading) {
    return (
      <div className="error-summary" role="alert">
        <p className="error-summary__heading">{SERVER_ERROR_MESSAGE}</p>
      </div>
    );
  }

  return (
    <ReportFormPanel
      type={report.type}
      initialValues={report.values}
      categories={reading.categories}
      campusAreas={reading.campusAreas}
      minDate={reading.minDate}
      maxDate={reading.maxDate}
      editing
      reportId={report.reportId}
    />
  );
}

/**
 * The not-found page.
 *
 * **The same page for a report that does not exist and for one the member
 * may not see.** The report's existence is a private fact about another
 * member's assertion, so the two are deliberately indistinguishable.
 */
function ReportNotFound(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Report not found'}</h1>

      <p className="empty-view__body">
        {'That report could not be found. It may have been removed, or the link may be wrong.'}
      </p>
    </div>
  );
}
