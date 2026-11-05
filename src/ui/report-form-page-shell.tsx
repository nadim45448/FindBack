import { Breadcrumbs } from './breadcrumbs';

import {
  DASHBOARD_LABEL,
  MY_REPORTS_PAGE_TITLE,
  REPORT_EDIT_HEADING,
  REPORT_EDIT_LEDE,
  REPORT_FORM_FOUND_DESCRIPTION,
  REPORT_FORM_LOST_DESCRIPTION,
  REPORT_FOUND_BREADCRUMB,
  REPORT_FOUND_HEADING,
  REPORT_LOST_BREADCRUMB,
  REPORT_LOST_HEADING,
} from './member-copy';

export interface ReportFormPageShellProps {
  readonly type: 'Lost' | 'Found';
  /** When true, breadcrumbs and copy match mockup `09-edit-report.html`. */
  readonly editing?: boolean | undefined;
  readonly children: React.ReactNode;
}

/**
 * Report form page chrome — mockup `14-report-lost` / `15-report-found`.
 */
export function ReportFormPageShell({
  type,
  editing = false,
  children,
}: ReportFormPageShellProps): React.JSX.Element {
  const isLost = type === 'Lost';
  const current = isLost ? REPORT_LOST_BREADCRUMB : REPORT_FOUND_BREADCRUMB;

  const crumbs = editing
    ? [
        { label: MY_REPORTS_PAGE_TITLE, href: '/my/reports' },
        { label: REPORT_EDIT_HEADING, href: null as string | null },
      ]
    : [
        { label: DASHBOARD_LABEL, href: '/home' },
        { label: current, href: null as string | null },
      ];

  return (
    <div className="form-page">
      <Breadcrumbs variant="compact" crumbs={crumbs} />

      <h1 className="hero__title">
        {editing ? REPORT_EDIT_HEADING : isLost ? REPORT_LOST_HEADING : REPORT_FOUND_HEADING}
      </h1>

      <p className="hero__lede">
        {editing
          ? REPORT_EDIT_LEDE
          : isLost
            ? REPORT_FORM_LOST_DESCRIPTION
            : REPORT_FORM_FOUND_DESCRIPTION}
      </p>

      {children}
    </div>
  );
}
