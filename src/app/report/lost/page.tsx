import type { Metadata } from 'next';

import { ReportFormPageShell } from '@/ui/report-form-page-shell';
import { ReportFormPanel, EMPTY_REPORT_FORM_VALUES } from '@/ui/report-form-panel';

import { requireMember } from '../../my/_member-page';
import { readReportForm, SERVER_ERROR_MESSAGE } from '../_report-form-page';

export const metadata: Metadata = {
  title: 'Report lost item',
};

/**
 * `Report Lost Item` — §10.1.
 *
 * ## The type is the URL
 *
 * §10.1: *"The 'Lost' or 'Found' decision is encoded in the URL
 * (`/report/lost` vs `/report/found`). The form opens with the type
 * already chosen — the user does not need to pick it."*
 *
 * **So this route fixes the type at `Lost` and the form renders no type
 * control.** There is no way to toggle between Lost and Found on this
 * form — the other form is a different URL.
 *
 * ## The date bound is the Lost bound
 *
 * §10.3: *"Date (Lost): last 365 days, not future"*. The number is the
 * domain's; the route only turns it into the picker's `min` and `max`.
 */
export default async function ReportLostPage(): Promise<React.JSX.Element> {
  // **The member is resolved for the redirect,** not for a value — the
  // form submits through the API, which resolves the actor itself.
  await requireMember('/report/lost');

  const reading = await readReportForm('Lost');

  if (!reading) {
    return (
      <div className="error-summary" role="alert">
        <p className="error-summary__heading">{SERVER_ERROR_MESSAGE}</p>
      </div>
    );
  }

  return (
    <ReportFormPageShell type="Lost">
      <ReportFormPanel
        type="Lost"
        initialValues={{ ...EMPTY_REPORT_FORM_VALUES, date: reading.maxDate }}
        categories={reading.categories}
        campusAreas={reading.campusAreas}
        minDate={reading.minDate}
        maxDate={reading.maxDate}
      />
    </ReportFormPageShell>
  );
}
