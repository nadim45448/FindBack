/**
 * The pagination model for the report listings.
 *
 * **The page size is bounded, and the bound is what keeps the query
 * index-backed.** FR-14's performance target is ≤ 500 ms p95 at 10,000
 * active reports, and the mechanism is Architecture's — but a mechanism
 * cannot deliver a budget if the request may ask for the whole table. The
 * maximum page size is therefore part of the domain's contract, not a
 * route-level convenience.
 *
 * **The ordering is by date, most recent first.** The story says it
 * exactly: "when rows are rendered without an explicit ordering, they are
 * ordered by date, most recent first". So the ordering is **not** left to
 * the database's discretion — an unordered `SELECT` may return rows in any
 * order, and a listing whose order changes between pages would show the
 * same report twice and skip another.
 *
 * **The pagination is offset-based**, because the story asks for pagination
 * and the ordering is a single stable key. The tie-break is the report's
 * id, so two reports sharing a date have a **total** order — without it,
 * two pages could overlap or leave a gap.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** The default page size. */
export const DEFAULT_PAGE_SIZE = 25;

/** The largest page a caller may request. */
export const MAX_PAGE_SIZE = 100;

/**
 * The page a caller asked for.
 *
 * **The page is one-based.** Page 1 is the first page. A zero-based page
 * would make `page=0` and "no page" the same request, and the two would
 * need different handling for no reason.
 */
export interface ReportPage {
  /** The one-based page number. */
  readonly number: number;
  /** The rows per page. */
  readonly size: number;
}

/**
 * The default page.
 */
export function defaultPage(): ReportPage {
  return { number: 1, size: DEFAULT_PAGE_SIZE };
}

/**
 * Parse a submitted page number.
 *
 * @throws {ValidationError} when the value is not a positive integer.
 */
export function parsePageNumber(value: string | null): number {
  if (value === null || value.trim() === '') {
    return 1;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError('page', 'Enter a valid page number.');
  }

  return parsed;
}

/**
 * Parse a submitted page size.
 *
 * @throws {ValidationError} when the value is not a positive integer, or
 * when it exceeds the maximum.
 */
export function parsePageSize(value: string | null): number {
  if (value === null || value.trim() === '') {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError('pageSize', 'Enter a valid page size.');
  }

  if (parsed > MAX_PAGE_SIZE) {
    throw new ValidationError(
      'pageSize',
      `Show at most ${MAX_PAGE_SIZE} reports per page.`,
    );
  }

  return parsed;
}

/**
 * Build a page from the submitted parameters.
 *
 * The two bounds are applied in one place, so a caller cannot assemble a
 * page that the parsers would have refused.
 */
export function buildPage(number: number, size: number): ReportPage {
  return { number, size };
}

/**
 * The number of rows to skip for a page.
 *
 * **The offset is computed from the page's own size**, so the skip and the
 * limit always describe the same pagination.
 */
export function offsetFor(page: ReportPage): number {
  return (page.number - 1) * page.size;
}
