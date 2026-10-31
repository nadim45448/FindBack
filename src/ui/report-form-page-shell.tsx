import { Breadcrumbs } from './breadcrumbs';

import {
  DASHBOARD_LABEL,
  REPORT_FORM_FOUND_DESCRIPTION,
  REPORT_FORM_LOST_DESCRIPTION,
  REPORT_FOUND_BREADCRUMB,
  REPORT_FOUND_HEADING,
  REPORT_LOST_BREADCRUMB,
  REPORT_LOST_HEADING,
} from './member-copy';

export interface ReportFormPageShellProps {
  readonly type: 'Lost' | 'Found';
  readonly children: React.ReactNode;
}

/**
 * Report form page chrome — mockup `14-report-lost` / `15-report-found`.
 */
export function ReportFormPageShell({
  type,
  children,
}: ReportFormPageShellProps): React.JSX.Element {
  const isLost = type === 'Lost';
  const current = isLost ? REPORT_LOST_BREADCRUMB : REPORT_FOUND_BREADCRUMB;

  return (
    <div className="form-page">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: DASHBOARD_LABEL, href: '/home' },
          { label: current, href: null },
        ]}
      />

      <h1 className="hero__title">{isLost ? REPORT_LOST_HEADING : REPORT_FOUND_HEADING}</h1>

      <p className="hero__lede">
        {isLost ? REPORT_FORM_LOST_DESCRIPTION : REPORT_FORM_FOUND_DESCRIPTION}
      </p>

      {children}
    </div>
  );
}
