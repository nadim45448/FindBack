/**
 * The public and member listings query string.
 *
 * Filters live in the URL so a listing is bookmarkable and the same
 * parser can run on the server (the page) and in the filter form.
 */

import {
  emptyFilter,
  isReportCategory,
  parseKeyword,
  type ReportListingFilter,
} from '@/domain/listings';
import { isReportType } from '@/domain/listings/report-type';

/** One query value, taking the first when the key is repeated. */
export function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

/**
 * Build a listing filter from URL search params.
 *
 * Unknown or empty values are ignored rather than refused — a stale
 * bookmark should still show the listing.
 */
export function listingFilterFromParams(params: {
  readonly [key: string]: string | string[] | undefined;
}): ReportListingFilter {
  const keywordRaw = firstQueryValue(params['q']) ?? firstQueryValue(params['kw']);
  const categoryRaw = firstQueryValue(params['category']);
  const campusRaw = firstQueryValue(params['campusArea']) ?? firstQueryValue(params['location']);
  const typeRaw = firstQueryValue(params['type']);

  let keyword: string | null = null;

  if (keywordRaw && keywordRaw.trim()) {
    try {
      const parsed = parseKeyword(keywordRaw);
      keyword = parsed.length > 0 ? parsed : null;
    } catch {
      keyword = null;
    }
  }

  const titledType = typeRaw
    ? typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1).toLowerCase()
    : null;

  return {
    ...emptyFilter(),
    keyword,
    category: categoryRaw && isReportCategory(categoryRaw) ? categoryRaw : null,
    campusArea: campusRaw && campusRaw.trim() ? campusRaw.trim() : null,
    type: titledType && isReportType(titledType) ? titledType : null,
  };
}

/** The page number from the URL, defaulting to 1. */
export function listingPageFromParams(params: {
  readonly [key: string]: string | string[] | undefined;
}): number {
  const raw = firstQueryValue(params['page']);
  const parsed = raw ? Number.parseInt(raw, 10) : 1;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Serialize a listing filter (and optional page) as search params. */
export function listingSearchParams(
  filter: ReportListingFilter,
  page = 1,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filter.keyword) {
    params.set('q', filter.keyword);
  }

  if (filter.category) {
    params.set('category', filter.category);
  }

  if (filter.campusArea) {
    params.set('campusArea', filter.campusArea);
  }

  if (filter.type) {
    params.set('type', filter.type);
  }

  if (page > 1) {
    params.set('page', String(page));
  }

  return params;
}

/** A listings href that preserves the current filters. */
export function listingHref(filter: ReportListingFilter, page = 1): string {
  const params = listingSearchParams(filter, page);
  const query = params.toString();

  return query.length > 0 ? `/listings?${query}` : '/listings';
}
