'use client';

import Link from 'next/link';

import type { ClaimListingRow } from '@/domain/listings';
import type { ClaimStatus } from '@/domain/listings/claim-status';

import { MemberDataTableRow } from './member-data-table-row';

import {
  BROWSE_ITEMS_BUTTON,
  MY_CLAIMS_EMPTY_HEADING,
  MY_CLAIMS_FILTER_LABEL,
  MY_CLAIMS_PAGE_TITLE,
  MY_CLAIMS_TABLE_CLAIM_STATUS,
  MY_CLAIMS_TABLE_ITEM,
  MY_CLAIMS_TABLE_ITEM_STATUS,
  MY_CLAIMS_TABLE_SUBMITTED,
  OPEN_THREAD_BUTTON,
  SERVER_ERROR_MESSAGE,
} from './member-copy';
import { StatusBadge } from './status-badge';

export interface MyClaimsSurfaceProps {
  readonly rows: readonly ClaimListingRow[];
  readonly campusAreaLabels: Readonly<Record<string, string>>;
  readonly statusFilter: ClaimStatus | null;
  readonly error?: string | undefined;
}

const CLAIM_FILTER_STATUSES: readonly ClaimStatus[] = ['Pending', 'Approved', 'Rejected'];

const STATUS_FILTER_OPTIONS: readonly { readonly value: string; readonly label: string }[] =
  Object.freeze([
    { value: '', label: 'All' },
    ...CLAIM_FILTER_STATUSES.map((status) => ({ value: status, label: status })),
  ]);

function formatSubmittedAt(iso: string): string {
  if (iso.length >= 10 && iso[4] === '-' && iso[7] === '-') {
    return iso.slice(0, 10);
  }

  return iso;
}

/**
 * My claims — mockup `10-my-claims.html`.
 */
export function MyClaimsSurface({
  rows,
  campusAreaLabels,
  statusFilter,
  error,
}: MyClaimsSurfaceProps): React.JSX.Element {
  return (
    <div className="member-view-page">
      <div className="member-view-page__head">
        <h1 className="member-view-page__title">{MY_CLAIMS_PAGE_TITLE}</h1>

        <div className="member-view-page__actions">
          <Link href="/listings" className="button button--secondary button--sm">
            {BROWSE_ITEMS_BUTTON}
          </Link>
        </div>
      </div>

      <form className="member-filter-card" action="/my/claims" method="get">
        <h2 className="member-filter-card__heading">{MY_CLAIMS_FILTER_LABEL}</h2>

        <div className="field">
          <label className="field__label" htmlFor="my-claims-status">
            {MY_CLAIMS_TABLE_CLAIM_STATUS}
          </label>

          <select
            id="my-claims-status"
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

      {!error && rows.length === 0 ? <MyClaimsEmpty /> : null}

      {!error && rows.length > 0 ? (
        <section aria-live="polite">
          <ClaimsTable rows={rows} campusAreaLabels={campusAreaLabels} />
        </section>
      ) : null}
    </div>
  );
}

function MyClaimsEmpty(): React.JSX.Element {
  return (
    <div className="listings__empty">
      <strong>{MY_CLAIMS_EMPTY_HEADING}</strong>

      <div>
        {'Browse the '}
        <Link href="/listings">Lost &amp; Found listings</Link>
        {" and submit a claim if you spot something that's yours."}
      </div>
    </div>
  );
}

function ClaimsTable({
  rows,
  campusAreaLabels,
}: {
  readonly rows: readonly ClaimListingRow[];
  readonly campusAreaLabels: Readonly<Record<string, string>>;
}): React.JSX.Element {
  return (
    <table className="member-data-table">
      <thead>
        <tr>
          <th scope="col">{MY_CLAIMS_TABLE_ITEM}</th>
          <th scope="col">{MY_CLAIMS_TABLE_SUBMITTED}</th>
          <th scope="col">{MY_CLAIMS_TABLE_CLAIM_STATUS}</th>
          <th scope="col">{MY_CLAIMS_TABLE_ITEM_STATUS}</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <ClaimTableRow key={row.id} row={row} campusAreaLabels={campusAreaLabels} />
        ))}
      </tbody>
    </table>
  );
}

function ClaimTableRow({
  row,
  campusAreaLabels,
}: {
  readonly row: ClaimListingRow;
  readonly campusAreaLabels: Readonly<Record<string, string>>;
}): React.JSX.Element {
  const detailHref = `/my/claims/${row.id}`;
  const campusLabel = campusAreaLabels[row.report.campusArea] ?? row.report.campusArea;

  return (
    <MemberDataTableRow href={detailHref}>
      <td data-label={MY_CLAIMS_TABLE_ITEM}>
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

      <td className="tabular" data-label={MY_CLAIMS_TABLE_SUBMITTED}>
        {formatSubmittedAt(row.submittedAt)}
      </td>

      <td data-label={MY_CLAIMS_TABLE_CLAIM_STATUS}>
        <StatusBadge status={row.status} kind="Status" />
      </td>

      <td data-label={MY_CLAIMS_TABLE_ITEM_STATUS}>
        <StatusBadge status={row.report.status} kind="Status" />
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
