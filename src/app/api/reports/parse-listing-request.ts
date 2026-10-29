/**
 * The listing request parser — the query parameters of the FR-14 search.
 *
 * **The parser is the boundary where the request becomes a filter.** Every
 * value the caller supplied is read here, validated here, and turned into
 * the domain's filter shape — so the use case never sees a raw string.
 *
 * **Unknown parameters are dropped, not rejected.** A client that sends an
 * extra parameter is not making a mistake worth a 400; a client that sends
 * an *invalid value* for a parameter the product defines is. So the parser
 * reads the parameters it knows and ignores the rest — which is also what
 * keeps a caller from smuggling a field the product does not expose (a
 * `reporterId`, an `exactPlace`) into a request whose only effect would be
 * to be ignored.
 *
 * **The keyword is bounded, and the error never echoes it.** The keyword
 * could carry a Sensitive Field's contents — a member searching for their
 * own passport number — and a 400 must not put it back on the wire.
 *
 * **The location filter is the campus area enum, never the exact place.**
 * The exact place is an FR-37 Sensitive Field, and filtering on it would
 * require loading it for viewers not authorised to read it. The campus area
 * is the only non-sensitive location field, and it is the only one the
 * filter may name.
 *
 * **The statuses are a repeated parameter.** `?status=Open&status=Closed`
 * is the shape a multi-select takes, and a single `status` is the shape a
 * radio takes — both are read the same way, and both mean the same thing.
 */

import { ValidationError } from '@/lib/errors';

import {
  emptyFilter,
  parseDateRange,
  parseFilterCategory,
  parseFilterStatus,
  parseFilterType,
  parseKeyword,
  type ReportListingFilter,
} from '@/domain/listings';

/**
 * Parse the listing's query parameters.
 *
 * @param params the request's query parameters.
 *
 * @throws {ValidationError} when a value is outside the set the product
 * defines.
 */
export function parseListingFilter(params: URLSearchParams): ReportListingFilter {
  const keyword = params.get('keyword');
  const category = params.get('category');
  const campusArea = params.get('campusArea');
  const type = params.get('type');
  const from = params.get('from');
  const to = params.get('to');
  const statuses = params.getAll('status');

  // **The keyword is parsed through the domain's own parser**, so the length
  // bound lives in one place — the domain — and the route does not repeat
  // it.
  const parsedKeyword = keyword === null || keyword.trim() === '' ? null : parseKeyword(keyword);

  const parsedCategory = category === null || category === '' ? null : parseFilterCategory(category);

  const parsedType = type === null || type === '' ? null : parseFilterType(type);

  const parsedStatuses =
    statuses.length === 0
      ? null
      : statuses.map((status) => parseFilterStatus(status));

  const parsedRange = parseDateRange(
    from === null || from === '' ? null : from,
    to === null || to === '' ? null : to,
  );

  // **The campus area is a free string, not a closed enum.** ADR-20 makes
  // the areas a deployment's decision, seeded per deployment rather than
  // declared in the code — so the filter cannot validate the value against
  // a list the product does not own. A filter for an area that does not
  // exist returns nothing, which is the right answer and not an error.
  //
  // **It is bounded, though.** An unbounded string is a resource problem,
  // and the campus area is a stored enum value, so it is short by
  // construction.
  const parsedCampusArea = campusArea === null || campusArea === '' ? null : parseCampusArea(campusArea);

  return {
    ...emptyFilter(),
    keyword: parsedKeyword,
    category: parsedCategory,
    campusArea: parsedCampusArea,
    dateRange: parsedRange,
    type: parsedType,
    statuses: parsedStatuses,
  };
}

/**
 * The maximum length of a campus area value.
 *
 * The stored value is an enum value the deployment seeds, so it is short by
 * construction — the bound is here to refuse an absurd value, not to
 * validate the deployment's choices.
 */
export const MAX_CAMPUS_AREA_LENGTH = 64;

/**
 * Parse a submitted campus area.
 *
 * @throws {ValidationError} when the value is longer than the maximum.
 */
function parseCampusArea(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length > MAX_CAMPUS_AREA_LENGTH) {
    throw new ValidationError('campusArea', 'That campus area is not one of the available areas.');
  }

  return trimmed;
}
