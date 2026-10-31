import Link from 'next/link';

import type { ReportListingFilter, ReportListingRow } from '@/domain/listings';
import type { ListingPage } from '@/domain/listings/report-listing-result';

import {
  LISTINGS_EMPTY_HEADING,
  LISTINGS_EMPTY_HINT,
} from './copy';
import { ListingsFilters, type ListingsFilterArea } from './listings-filters';
import { listingHref } from './listings-query';
import { MEMBER_BROWSE_PAGE_TITLE } from './member-copy';
import { StatusBadge } from './status-badge';

export interface BrowseMemberSurfaceProps {
  readonly page: ListingPage<ReportListingRow> | null;
  readonly filter: ReportListingFilter;
  readonly campusAreas: readonly ListingsFilterArea[];
  readonly campusAreaLabels: Readonly<Record<string, string>>;
  readonly error?: string | undefined;
}

function resultCountLabel(total: number): string {
  return `${total} report${total === 1 ? '' : 's'}`;
}

/**
 * Member browse — mockup `02-listings-member.html`.
 */
export function BrowseMemberSurface({
  page,
  filter,
  campusAreas,
  campusAreaLabels,
  error,
}: BrowseMemberSurfaceProps): React.JSX.Element {
  return (
    <div className="listings-page listings-page--member">
      <div className="listings-page__head">
        <h1 className="member-view-page__title">{MEMBER_BROWSE_PAGE_TITLE}</h1>

        {page && !error ? (
          <p className="listings-page__meta" role="status">
            {resultCountLabel(page.total)}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      <div className="listings">
        <ListingsFilters filter={filter} campusAreas={campusAreas} />

        <section className="listings__results" aria-live="polite">
          {!page && !error ? (
            <p className="field__helper" role="status">
              Loading…
            </p>
          ) : null}

          {page && page.rows.length === 0 ? (
            <div className="listings__empty">
              <strong>{LISTINGS_EMPTY_HEADING}</strong>
              <div>{LISTINGS_EMPTY_HINT}</div>
            </div>
          ) : null}

          {page && page.rows.length > 0 ? (
            <ul className="listing">
              {page.rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/listings/${row.id}`} className="item-card">
                    <div className="item-card__head">
                      <h2 className="item-card__title">{row.name}</h2>
                      <div className="item-card__badges">
                        <StatusBadge status={row.type} kind="Type" tone="neutral" />
                        <StatusBadge status={row.status} kind="Status" />
                      </div>
                    </div>
                    <div className="item-card__meta">
                      <span>Category · {row.category}</span>
                      <span>
                        Location · {campusAreaLabels[row.campusArea] ?? row.campusArea}
                      </span>
                      <span className="tabular">Date · {row.date}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {page && page.totalPages > 1 ? (
            <nav className="pagination" aria-label="Pagination">
              {page.page > 1 ? (
                <Link
                  href={listingHref(filter, page.page - 1)}
                  className="button button--secondary"
                >
                  Previous
                </Link>
              ) : null}

              <span className="pagination__status tabular">
                Page {page.page} of {page.totalPages}
              </span>

              {page.page < page.totalPages ? (
                <Link
                  href={listingHref(filter, page.page + 1)}
                  className="button button--secondary"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
