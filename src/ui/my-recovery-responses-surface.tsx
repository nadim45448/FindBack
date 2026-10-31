'use client';

import Link from 'next/link';

import type { RecoveryResponseListingRow } from '@/domain/listings';
import {
  RECOVERY_RESPONSE_STATUSES,
  type RecoveryResponseStatus,
} from '@/domain/recovery/recovery-response-status';

import { MemberDataTableRow } from './member-data-table-row';

import {
  BROWSE_ITEMS_BUTTON,
  MY_RECOVERY_RESPONSES_EMPTY_HEADING,
  MY_RECOVERY_RESPONSES_FILTER_LABEL,
  MY_RECOVERY_RESPONSES_LEDE,
  MY_RECOVERY_RESPONSES_PAGE_TITLE,
  MY_RECOVERY_RESPONSES_TABLE_LOST_REPORT,
  MY_RECOVERY_RESPONSES_TABLE_STATUS,
  MY_RECOVERY_RESPONSES_TABLE_SUBMITTED,
  OPEN_THREAD_BUTTON,
  SERVER_ERROR_MESSAGE,
} from './member-copy';
import { StatusBadge } from './status-badge';

export interface MyRecoveryResponsesSurfaceProps {
  readonly rows: readonly RecoveryResponseListingRow[];
  readonly campusAreaLabels: Readonly<Record<string, string>>;
  readonly statusFilter: RecoveryResponseStatus | null;
  readonly error?: string | undefined;
}

const STATUS_FILTER_OPTIONS: readonly { readonly value: string; readonly label: string }[] =
  Object.freeze([
    { value: '', label: 'All' },
    ...RECOVERY_RESPONSE_STATUSES.map((status) => ({ value: status, label: status })),
  ]);

function formatSubmittedAt(iso: string): string {
  if (iso.length >= 10 && iso[4] === '-' && iso[7] === '-') {
    return iso.slice(0, 10);
  }

  return iso;
}

/**
 * My recovery responses — mockup `18-my-recovery-responses.html`.
 */
export function MyRecoveryResponsesSurface({
  rows,
  campusAreaLabels,
  statusFilter,
  error,
}: MyRecoveryResponsesSurfaceProps): React.JSX.Element {
  return (
    <div className="member-view-page">
      <div className="member-view-page__head">
        <h1 className="member-view-page__title">{MY_RECOVERY_RESPONSES_PAGE_TITLE}</h1>

        <div className="member-view-page__actions">
          <Link href="/listings" className="button button--secondary button--sm">
            {BROWSE_ITEMS_BUTTON}
          </Link>
        </div>
      </div>

      <p className="field__helper member-view-page__lede">{MY_RECOVERY_RESPONSES_LEDE}</p>

      <form className="member-filter-card" action="/my/recovery-responses" method="get">
        <h2 className="member-filter-card__heading">{MY_RECOVERY_RESPONSES_FILTER_LABEL}</h2>

        <div className="field">
          <label className="field__label" htmlFor="my-recovery-responses-status">
            {MY_RECOVERY_RESPONSES_TABLE_STATUS}
          </label>

          <select
            id="my-recovery-responses-status"
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

      {!error && rows.length === 0 ? <MyRecoveryResponsesEmpty /> : null}

      {!error && rows.length > 0 ? (
        <section aria-live="polite">
          <RecoveryResponsesTable rows={rows} campusAreaLabels={campusAreaLabels} />
        </section>
      ) : null}
    </div>
  );
}

function MyRecoveryResponsesEmpty(): React.JSX.Element {
  return (
    <div className="listings__empty">
      <strong>{MY_RECOVERY_RESPONSES_EMPTY_HEADING}</strong>

      <div>
        {'Browse the '}
        <Link href="/listings">Lost &amp; Found listings</Link>
        {
          ' and click I may have found this item on a Lost report if you think you have it.'
        }
      </div>
    </div>
  );
}

function RecoveryResponsesTable({
  rows,
  campusAreaLabels,
}: {
  readonly rows: readonly RecoveryResponseListingRow[];
  readonly campusAreaLabels: Readonly<Record<string, string>>;
}): React.JSX.Element {
  return (
    <table className="member-data-table">
      <thead>
        <tr>
          <th scope="col">{MY_RECOVERY_RESPONSES_TABLE_LOST_REPORT}</th>
          <th scope="col">{MY_RECOVERY_RESPONSES_TABLE_SUBMITTED}</th>
          <th scope="col">{MY_RECOVERY_RESPONSES_TABLE_STATUS}</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <RecoveryResponseTableRow
            key={row.id}
            row={row}
            campusAreaLabels={campusAreaLabels}
          />
        ))}
      </tbody>
    </table>
  );
}

function RecoveryResponseTableRow({
  row,
  campusAreaLabels,
}: {
  readonly row: RecoveryResponseListingRow;
  readonly campusAreaLabels: Readonly<Record<string, string>>;
}): React.JSX.Element {
  const detailHref = `/my/recovery-responses/${row.id}`;
  const campusLabel = campusAreaLabels[row.report.campusArea] ?? row.report.campusArea;

  return (
    <MemberDataTableRow href={detailHref}>
      <td data-label={MY_RECOVERY_RESPONSES_TABLE_LOST_REPORT}>
        <Link
          href={detailHref}
          className="member-data-table__item-link"
          onClick={(event) => event.stopPropagation()}
        >
          <strong>{row.report.name}</strong>
        </Link>

        <div className="member-data-table__meta">
          {'Reported '}
          {row.report.date}
          {' at '}
          {campusLabel}
        </div>
      </td>

      <td className="tabular" data-label={MY_RECOVERY_RESPONSES_TABLE_SUBMITTED}>
        {formatSubmittedAt(row.submittedAt)}
      </td>

      <td data-label={MY_RECOVERY_RESPONSES_TABLE_STATUS}>
        <StatusBadge status={row.status} kind="Status" />
      </td>

      <td className="member-data-table__actions" data-label="">
        <Link
          href={detailHref}
          className="button button--secondary button--sm"
          onClick={(event) => event.stopPropagation()}
        >
          {OPEN_THREAD_BUTTON}
        </Link>
      </td>
    </MemberDataTableRow>
  );
}

export { SERVER_ERROR_MESSAGE };
