'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ReportListingRow, ReportStatus } from '@/domain/listings';
import { REPORT_STATUSES } from '@/domain/listings';

import type { ReportClaimSummary } from './my-reports-types';

import { StatusBadge } from './status-badge';

import {
  MY_REPORTS_EMPTY_HEADING,
  MY_REPORTS_FILTER_LABEL,
  MY_REPORTS_PAGE_TITLE,
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
  readonly campusAreaLabels: Readonly<Record<string, string>>;
  readonly statusFilter: ReportStatus | null;
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
  campusAreaLabels,
  statusFilter,
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

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      {!error && rows.length === 0 ? <MyReportsEmpty /> : null}

      {!error && rows.length > 0 ? (
        <section aria-live="polite">
          <ReportsTable
            rows={rows}
            claimSummaries={claimSummaries}
            campusAreaLabels={campusAreaLabels}
          />
        </section>
      ) : null}
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
  campusAreaLabels,
}: {
  readonly rows: readonly ReportListingRow[];
  readonly claimSummaries: Readonly<Record<string, ReportClaimSummary>>;
  readonly campusAreaLabels: Readonly<Record<string, string>>;
}): React.JSX.Element {
  const router = useRouter();

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
            campusLabel={campusAreaLabels[row.campusArea] ?? row.campusArea}
            onOpen={() => {
              router.push(`/my/reports/${row.id}`);
            }}
          />
        ))}
      </tbody>
    </table>
  );
}

function ReportTableRow({
  row,
  claimSummary,
  campusLabel,
  onOpen,
}: {
  readonly row: ReportListingRow;
  readonly claimSummary: ReportClaimSummary | undefined;
  readonly campusLabel: string;
  readonly onOpen: () => void;
}): React.JSX.Element {
  const detailHref = `/my/reports/${row.id}`;

  return (
    <tr
      className="member-data-table__row"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <td data-label={MY_REPORTS_TABLE_ITEM}>
        <Link href={detailHref} className="member-data-table__item-link" onClick={(e) => e.stopPropagation()}>
          <strong>{row.name}</strong>
        </Link>

        <div className="member-data-table__meta">
          {row.category}
          {' · '}
          {campusLabel}
        </div>
      </td>

      <td data-label={MY_REPORTS_TABLE_TYPE}>
        <StatusBadge status={row.type} kind="Type" tone="neutral" />
      </td>

      <td className="tabular" data-label={MY_REPORTS_TABLE_DATE}>
        {row.date}
      </td>

      <td data-label={MY_REPORTS_TABLE_STATUS}>
        <StatusBadge status={row.status} kind="Status" />
      </td>

      <td data-label={MY_REPORTS_TABLE_CLAIMS}>
        {formatClaimSummary(row.type, claimSummary)}
      </td>
    </tr>
  );
}

function formatClaimSummary(
  type: ReportListingRow['type'],
  summary: ReportClaimSummary | undefined,
): string {
  if (type === 'Lost') {
    return '—';
  }

  const approved = summary?.approved ?? 0;
  const pending = summary?.pending ?? 0;
  const rejected = summary?.rejected ?? 0;

  let text = `${approved} approved · ${pending} pending`;

  if (rejected > 0) {
    text += ` · ${rejected} rejected`;
  }

  return text;
}

export { SERVER_ERROR_MESSAGE };
