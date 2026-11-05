'use client';

import Link from 'next/link';

import {
  displayReportStatus,
  type ReportListingRow,
  type ReportStatus,
  type ReportType,
} from '@/domain/listings';
import { REPORT_STATUSES } from '@/domain/listings';

import type { ReportClaimSummary, ReportRecoverySummary } from './my-reports-types';

import { MemberDataTableRow } from './member-data-table-row';

import { StatusBadge } from './status-badge';

import {
  MY_REPORTS_EMPTY_HEADING,
  MY_REPORTS_FILTER_LABEL,
  MY_REPORTS_PAGE_TITLE,
  MY_REPORTS_NEEDS_REVIEW_BANNER,
  MY_REPORTS_TABLE_CLAIMS,
  MY_REPORTS_TABLE_DATE,
  MY_REPORTS_TABLE_ITEM,
  MY_REPORTS_TABLE_STATUS,
  MY_REPORTS_TABLE_TYPE,
  REPORT_FOUND_ITEM_SHORT,
  REPORT_LOST_ITEM_SHORT,
  SERVER_ERROR_MESSAGE,
} from './member-copy';

export interface MyReportsSurfaceProps {
  readonly rows: readonly ReportListingRow[];
  readonly claimSummaries: Readonly<Record<string, ReportClaimSummary>>;
  readonly recoverySummaries: Readonly<Record<string, ReportRecoverySummary>>;
  readonly campusAreaLabels: Readonly<Record<string, string>>;
  readonly statusFilter: ReportStatus | null;
  readonly needsReview?: boolean | undefined;
  readonly error?: string | undefined;
}

const STATUS_FILTER_OPTIONS: readonly { readonly value: string; readonly label: string }[] =
  Object.freeze([
    { value: '', label: 'All' },
    ...REPORT_STATUSES.map((status) => ({ value: status, label: status })),
  ]);

/**
 * My reports — mockup `08-my-reports.html`.
 */
export function MyReportsSurface({
  rows,
  claimSummaries,
  recoverySummaries,
  campusAreaLabels,
  statusFilter,
  needsReview = false,
  error,
}: MyReportsSurfaceProps): React.JSX.Element {
  return (
    <div className="member-view-page">
      <div className="member-view-page__head">
        <h1 className="member-view-page__title">{MY_REPORTS_PAGE_TITLE}</h1>

        <div className="member-view-page__actions">
          <Link href="/report/lost" className="button button--primary button--sm">
            {REPORT_LOST_ITEM_SHORT}
          </Link>

          <Link href="/report/found" className="button button--secondary button--sm">
            {REPORT_FOUND_ITEM_SHORT}
          </Link>
        </div>
      </div>

      <form className="member-filter-card" action="/my/reports" method="get">
        <h2 className="member-filter-card__heading">{MY_REPORTS_FILTER_LABEL}</h2>

        <div className="field">
          <label className="field__label" htmlFor="my-reports-status">
            {MY_REPORTS_TABLE_STATUS}
          </label>

          <select
            id="my-reports-status"
            className="select"
            name="status"
            defaultValue={statusFilter ?? ''}
            onChange={(event) => {
              event.currentTarget.form?.requestSubmit();
            }}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </form>

      {needsReview && !error ? (
        <div className="banner banner--info" role="status">
          <p>{MY_REPORTS_NEEDS_REVIEW_BANNER}</p>
        </div>
      ) : null}

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      {!error && rows.length === 0 ? (
        needsReview ? <MyReportsNeedsReviewEmpty /> : <MyReportsEmpty />
      ) : null}

      {!error && rows.length > 0 ? (
        <section aria-live="polite">
      <ReportsTable
        rows={rows}
        claimSummaries={claimSummaries}
        recoverySummaries={recoverySummaries}
        campusAreaLabels={campusAreaLabels}
      />
        </section>
      ) : null}
    </div>
  );
}

function MyReportsNeedsReviewEmpty(): React.JSX.Element {
  return (
    <div className="listings__empty">
      <strong>{MY_REPORTS_NEEDS_REVIEW_BANNER}</strong>

      <div>
        <Link href="/my/reports">{'View all my reports'}</Link>
      </div>
    </div>
  );
}

function MyReportsEmpty(): React.JSX.Element {
  return (
    <div className="listings__empty">
      <strong>{MY_REPORTS_EMPTY_HEADING}</strong>

      <div>
        {'Use '}
        <Link href="/report/lost">{REPORT_LOST_ITEM_SHORT}</Link>
        {' or '}
        <Link href="/report/found">{REPORT_FOUND_ITEM_SHORT}</Link>
        {' to start.'}
      </div>
    </div>
  );
}

function ReportsTable({
  rows,
  claimSummaries,
  recoverySummaries,
  campusAreaLabels,
}: {
  readonly rows: readonly ReportListingRow[];
  readonly claimSummaries: Readonly<Record<string, ReportClaimSummary>>;
  readonly recoverySummaries: Readonly<Record<string, ReportRecoverySummary>>;
  readonly campusAreaLabels: Readonly<Record<string, string>>;
}): React.JSX.Element {
  return (
    <table className="member-data-table">
      <thead>
        <tr>
          <th scope="col">{MY_REPORTS_TABLE_ITEM}</th>
          <th scope="col">{MY_REPORTS_TABLE_TYPE}</th>
          <th scope="col">{MY_REPORTS_TABLE_DATE}</th>
          <th scope="col">{MY_REPORTS_TABLE_STATUS}</th>
          <th scope="col">{MY_REPORTS_TABLE_CLAIMS}</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <ReportTableRow
            key={row.id}
            row={row}
            claimSummary={claimSummaries[row.id]}
            recoverySummary={recoverySummaries[row.id]}
            campusLabel={campusAreaLabels[row.campusArea] ?? row.campusArea}
          />
        ))}
      </tbody>
    </table>
  );
}

function ReportTableRow({
  row,
  claimSummary,
  recoverySummary,
  campusLabel,
}: {
  readonly row: ReportListingRow;
  readonly claimSummary: ReportClaimSummary | undefined;
  readonly recoverySummary: ReportRecoverySummary | undefined;
  readonly campusLabel: string;
}): React.JSX.Element {
  const detailHref = `/my/reports/${row.id}`;
  const statusLabel = displayReportStatus(row.type, row.status, {
    hasMatchConfirmed: recoverySummary?.hasMatchConfirmed ?? false,
  });

  return (
    <MemberDataTableRow href={detailHref}>
      <td data-label={MY_REPORTS_TABLE_ITEM}>
        <strong>{row.name}</strong>

        <div className="member-data-table__meta">
          {row.category}
          {' · '}
          {campusLabel}
        </div>
      </td>

      <td data-label={MY_REPORTS_TABLE_TYPE}>
        <ReportTypeBadge type={row.type} />
      </td>

      <td className="tabular" data-label={MY_REPORTS_TABLE_DATE}>
        {row.date}
      </td>

      <td data-label={MY_REPORTS_TABLE_STATUS}>
        <StatusBadge status={statusLabel} kind="Status" />
      </td>

      <td data-label={MY_REPORTS_TABLE_CLAIMS}>{formatClaimsCell(claimSummary)}</td>
    </MemberDataTableRow>
  );
}

function ReportTypeBadge({ type }: { readonly type: ReportType }): React.JSX.Element {
  const modifier = type === 'Lost' ? 'lost' : 'found';

  return (
    <span className={`report-type-badge report-type-badge--${modifier}`} aria-label={`Type: ${type}`}>
      {type}
    </span>
  );
}

/** Claims column — mockup `08-my-reports.html` (plain counts, no in-table links). */
function formatClaimsCell(claimSummary: ReportClaimSummary | undefined): string {
  const approved = claimSummary?.approved ?? 0;
  const pending = claimSummary?.pending ?? 0;
  const rejected = claimSummary?.rejected ?? 0;

  let text = `${approved} approved · ${pending} pending`;

  if (rejected > 0) {
    text += ` · ${rejected} rejected`;
  }

  return text;
}

export { SERVER_ERROR_MESSAGE };
