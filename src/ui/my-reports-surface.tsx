'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ReportListingRow, ReportStatus } from '@/domain/listings';
import { REPORT_STATUSES } from '@/domain/listings';

import type { ReportClaimSummary, ReportRecoverySummary } from './my-reports-types';

import { StatusBadge } from './status-badge';

import {
  MY_REPORTS_EMPTY_HEADING,
  MY_REPORTS_FILTER_LABEL,
  MY_REPORTS_PAGE_TITLE,
  MY_REPORTS_NEEDS_REVIEW_BANNER,
  MY_REPORTS_REVIEW_RESPONSES_LINK,
  MY_REPORTS_TABLE_ACTIVITY,
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
  const router = useRouter();

  return (
    <table className="member-data-table">
      <thead>
        <tr>
          <th scope="col">{MY_REPORTS_TABLE_ITEM}</th>
          <th scope="col">{MY_REPORTS_TABLE_TYPE}</th>
          <th scope="col">{MY_REPORTS_TABLE_DATE}</th>
          <th scope="col">{MY_REPORTS_TABLE_STATUS}</th>
          <th scope="col">{MY_REPORTS_TABLE_ACTIVITY}</th>
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
  recoverySummary,
  campusLabel,
  onOpen,
}: {
  readonly row: ReportListingRow;
  readonly claimSummary: ReportClaimSummary | undefined;
  readonly recoverySummary: ReportRecoverySummary | undefined;
  readonly campusLabel: string;
  readonly onOpen: () => void;
}): React.JSX.Element {
  const detailHref = `/my/reports/${row.id}`;
  const reviewHref = `/my/reports/${row.id}/review-responses`;

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

      <td data-label={MY_REPORTS_TABLE_ACTIVITY}>
        {formatActivityCell(row, claimSummary, recoverySummary, detailHref, reviewHref)}
      </td>
    </tr>
  );
}

function formatActivityCell(
  row: ReportListingRow,
  claimSummary: ReportClaimSummary | undefined,
  recoverySummary: ReportRecoverySummary | undefined,
  detailHref: string,
  reviewHref: string,
): React.JSX.Element | string {
  if (row.type === 'Lost') {
    const submitted = recoverySummary?.submitted ?? 0;
    const inProgress = recoverySummary?.inProgress ?? 0;

    if (row.status === 'Open' && submitted > 0) {
      return (
        <Link
          href={reviewHref}
          className="member-data-table__item-link"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {`${MY_REPORTS_REVIEW_RESPONSES_LINK} (${submitted})`}
        </Link>
      );
    }

    if (submitted > 0) {
      return `${submitted} submitted`;
    }

    if (inProgress > 0 || row.status === 'Verification Pending') {
      return (
        <Link
          href={reviewHref}
          className="member-data-table__item-link"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {MY_REPORTS_REVIEW_RESPONSES_LINK}
        </Link>
      );
    }

    return '—';
  }

  const approved = claimSummary?.approved ?? 0;
  const pending = claimSummary?.pending ?? 0;
  const rejected = claimSummary?.rejected ?? 0;

  if (pending > 0 && (row.status === 'Open' || row.status === 'Claim Requested')) {
    return (
      <Link
        href={detailHref}
        className="member-data-table__item-link"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {`${pending} pending · admin reviewing`}
      </Link>
    );
  }

  let text = `${approved} approved · ${pending} pending`;

  if (rejected > 0) {
    text += ` · ${rejected} rejected`;
  }

  return text;
}

export { SERVER_ERROR_MESSAGE };
