import type { Metadata } from 'next';

import { ReportFormPageShell } from '@/ui/report-form-page-shell';
import { ReportFormPanel, EMPTY_REPORT_FORM_VALUES } from '@/ui/report-form-panel';

import { requireMember } from '../../my/_member-page';
import { readReportForm, SERVER_ERROR_MESSAGE } from '../_report-form-page';

export const metadata: Metadata = {
  title: 'Report found item',
};

/**
 * `Report Found Item` — §10.1.
 *
 * ## The type is the URL
 *
 * **This route fixes the type at `Found` and the form renders no type
 * control.** §10.1's rule is the mirror of the Lost form's: the decision
 * is encoded in the URL, and the two forms are separate pages.
 *
 * ## The date bound is the Found bound
 *
 * §10.3: *"Date (Found): last 30 days, not future"*. The Found bound is
 * **not** the Lost bound relaxed — it is 30 days, and the domain owns the
 * number.
 */
export default async function ReportFoundPage(): Promise<React.JSX.Element> {
  // **The member is resolved for the redirect,** not for a value — the
  // form submits through the API, which resolves the actor itself.
  await requireMember('/report/found');

  const reading = await readReportForm('Found');

  if (!reading) {
    return (
      <div className="error-summary" role="alert">
        <p className="error-summary__heading">{SERVER_ERROR_MESSAGE}</p>
      </div>
    );
  }

  return (
    <ReportFormPageShell type="Found">
      <ReportFormPanel
        type="Found"
        initialValues={{ ...EMPTY_REPORT_FORM_VALUES, date: reading.maxDate }}
        categories={reading.categories}
        campusAreas={reading.campusAreas}
        minDate={reading.minDate}
        maxDate={reading.maxDate}
      />
    </ReportFormPageShell>
  );
}
