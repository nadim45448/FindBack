'use client';

/**
 * The listings filter card.
 *
 * Generated mockup `member/01-listings-anon.html` — Search, Category,
 * Location, Type. EXPERIENCE.md §9.1 names the same bar. Changing a
 * control updates the URL so the server re-reads the listing.
 */

import { useRef } from 'react';
import { useRouter } from 'next/navigation';

import { REPORT_CATEGORIES, type ReportListingFilter } from '@/domain/listings';

import {
  LISTINGS_FILTERS_HEADING,
  LISTINGS_SEARCH_LABEL,
  LISTINGS_SEARCH_PLACEHOLDER,
  LISTINGS_TYPE_BOTH,
} from './copy';
import { listingFilterFromParams, listingHref } from './listings-query';

/** A campus area option. */
export interface ListingsFilterArea {
  readonly value: string;
  readonly label: string;
}

/** The listings filter card's props. */
export interface ListingsFiltersProps {
  /** The filter currently applied. */
  readonly filter: ReportListingFilter;
  /** The campus areas that can be chosen. */
  readonly campusAreas: readonly ListingsFilterArea[];
}

/** The listings filter card. */
export function ListingsFilters({
  filter,
  campusAreas,
}: ListingsFiltersProps): React.JSX.Element {
  const router = useRouter();
  const debounce = useRef<number>(0);

  function apply(form: HTMLFormElement): void {
    const data = new FormData(form);

    router.push(
      listingHref(
        listingFilterFromParams({
          q: stringField(data, 'q') ?? undefined,
          category: stringField(data, 'category') ?? undefined,
          campusArea: stringField(data, 'campusArea') ?? undefined,
          type: stringField(data, 'type') ?? undefined,
        }),
      ),
    );
  }

  return (
    <form
      className="filter-card"
      method="get"
      action="/listings"
      onChange={(event) => {
        const form = event.currentTarget;
        const target = event.target;

        window.clearTimeout(debounce.current);

        if (target instanceof HTMLInputElement && target.type === 'search') {
          debounce.current = window.setTimeout(() => apply(form), 400);
          return;
        }

        apply(form);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        window.clearTimeout(debounce.current);
        apply(event.currentTarget);
      }}
    >
      <h2>{LISTINGS_FILTERS_HEADING}</h2>

      <div className="field">
        <label className="field__label" htmlFor="listings-q">
          {LISTINGS_SEARCH_LABEL}
        </label>
        <input
          id="listings-q"
          className="input"
          type="search"
          name="q"
          defaultValue={filter.keyword ?? ''}
          placeholder={LISTINGS_SEARCH_PLACEHOLDER}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="listings-category">
          Category
        </label>
        <select
          id="listings-category"
          className="select"
          name="category"
          defaultValue={filter.category ?? ''}
        >
          <option value="">All categories</option>
          {REPORT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="listings-location">
          Location
        </label>
        <select
          id="listings-location"
          className="select"
          name="campusArea"
          defaultValue={filter.campusArea ?? ''}
        >
          <option value="">All locations</option>
          {campusAreas.map((area) => (
            <option key={area.value} value={area.value}>
              {area.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="listings-type">
          Type
        </label>
        <select
          id="listings-type"
          className="select"
          name="type"
          defaultValue={filter.type ?? ''}
        >
          <option value="">{LISTINGS_TYPE_BOTH}</option>
          <option value="Lost">Lost</option>
          <option value="Found">Found</option>
        </select>
      </div>
    </form>
  );
}

function stringField(data: FormData, name: string): string | null {
  const value = data.get(name);

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
