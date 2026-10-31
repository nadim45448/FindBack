'use client';

/**
 * The anonymous listings surface.
 *
 * ## §9.1
 *
> - **Listings (`/listings`).** Summary view (PRD FR-12, FR-38). Filter bar
>   (keyword, category, location, type, status). … Clicking a row routes to
>   `/login?return=/listings/:id` with a message: "Sign in to see item
 *   details."
 *
 * ## There is no anonymous detail page
 *
 * Story 002's criterion: *"the browser routes to `/login?return=/listings/:id`
 * with the message `Sign in to see item details.`, and no anonymous detail
 * page exists"*.
 *
 * **So the card is a link to the login screen, carrying the destination in
 * `return`.** There is no anonymous `/listings/:id` page.
 *
 * ## The rows carry the FR-38 summary set, and nothing else
 *
 * The listing endpoint's rows *are* the FR-38 set — the server does not
 * send a fuller row with fields stripped. So an anonymous viewer never
 * receives a description, an image reference, an exact place, an
 * identifying detail, a reporter identity, a Claim, a Recovery Response, a
 * thread, or an audit entry. **This surface renders the fields it is
 * given and no others.**
 */

import Link from 'next/link';

import type { ReportListingFilter } from '@/domain/listings';

import {
  LISTINGS_EMPTY_HEADING,
  LISTINGS_EMPTY_HINT,
  PUBLIC_LISTINGS_HEADING,
  PUBLIC_SUMMARY_BANNER_BODY,
  PUBLIC_SUMMARY_BANNER_INVITE,
  PUBLIC_SUMMARY_BANNER_LEAD,
  PUBLIC_SUMMARY_META,
  SIGN_IN,
} from './copy';
import { ListingsFilters, type ListingsFilterArea } from './listings-filters';
import { listingHref } from './listings-query';
import { StatusBadge } from './status-badge';

/**
 * The message shown when an anonymous visitor tries to open a row.
 *
 * §9.1 names it exactly: *"Sign in to see item details."*
 */
export const SIGN_IN_TO_SEE_DETAILS = 'Sign in to see item details.';

/** A listing row, as the endpoint returns it. */
export interface ListingRow {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly name: string;
  readonly category: string;
  readonly date: string;
  readonly campusArea: string;
}

/** A page of rows, as the endpoint returns it. */
export interface ListingPage {
  readonly rows: readonly ListingRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

/** The listings surface's props. */
export interface ListingsSurfaceProps {
  /** The listing's page, fetched on the server. */
  readonly page: ListingPage | null;
  /** The error, when the fetch failed. */
  readonly error?: string | undefined;
  /** The filter currently applied. */
  readonly filter?: ReportListingFilter | undefined;
  /** The campus areas the filter can name. */
  readonly campusAreas?: readonly ListingsFilterArea[] | undefined;
}

/**
 * The listings surface.
 */
export function ListingsSurface({
  page,
  error,
  filter,
  campusAreas = [],
}: ListingsSurfaceProps): React.JSX.Element {
  const applied = filter;

  return (
    <div className="listings-page">
      <div className="listings-page__head">
        <h1 className="hero__title">{PUBLIC_LISTINGS_HEADING}</h1>
        <p className="listings-page__meta">{PUBLIC_SUMMARY_META}</p>
      </div>

      <div className="alert alert--info">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>{PUBLIC_SUMMARY_BANNER_LEAD}</strong> {PUBLIC_SUMMARY_BANNER_BODY}{' '}
          <Link href="/login">{SIGN_IN}</Link> {PUBLIC_SUMMARY_BANNER_INVITE}
        </div>
      </div>

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      <div className="listings">
        {applied ? <ListingsFilters filter={applied} campusAreas={campusAreas} /> : null}

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
                  <Link
                    href={`/login?return=/listings/${row.id}`}
                    className="item-card"
                  >
                    <div className="item-card__head">
                      <h2 className="item-card__title">{row.name}</h2>
                      <div className="item-card__badges">
                        <StatusBadge status={row.type} kind="Type" tone="neutral" />
                        <StatusBadge status={row.status} kind="Status" />
                      </div>
                    </div>
                    <p className="item-card__invite">{SIGN_IN_TO_SEE_DETAILS}</p>
                    <div className="item-card__meta">
                      <span>Category · {row.category}</span>
                      <span>Location · {row.campusArea}</span>
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
                  href={applied ? listingHref(applied, page.page - 1) : `/listings?page=${page.page - 1}`}
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
                  href={applied ? listingHref(applied, page.page + 1) : `/listings?page=${page.page + 1}`}
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
