/**
 * The `ReportFieldValidator` — the **only** path to a `Report`.
 *
 * **A pure function of the draft, the type, and two injected inputs.** It
 * takes the submitted fields and returns either a validated report or a
 * **field-level** error naming the offending field. It has no dependencies
 * beyond the value objects, the category set, the campus-area set, and the
 * clock — no I/O, no database, no network.
 *
 * **It is the same validator for creation (stories 001/002) and reporter edit
 * (story 004)**, so the bounds are enforced identically on both paths by
 * construction, not by two implementations that agree today. Story 003's
 * technical note says exactly this.
 *
 * **The date bound is applied here, and only here.** The bound is the one
 * thing that differs between the two report types, and one place is one
 * implementation.
 *
 * **The clock is injected, never read from `new Date()`.** An injected clock
 * is what makes "exactly 365 days ago is accepted" a testable assertion
 * rather than a test that only passes on the right day.
 *
 * **The campus-area set is injected, never hard-coded.** The list is
 * per-deployment external data (FR-8, A4, ADR-20), and the domain must not
 * assume one deployment's areas.
 *
 * Pure — no I/O, no framework imports.
 */

import { createCampusAreaValue, type CampusArea } from './campus-area-value';
import { createExactPlace } from './exact-place';
import { createIdentifyingDetails } from './identifying-details';
import { parseReportCategory } from './report-category';
import { createReportDescription } from './report-description';
import { createReportName } from './report-name';
import { parseReportDate, validateDateFound, validateDateLost } from './report-date';
import type { ReportDraft, ValidatedReport } from './report';
import type { ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/** The inputs the validator needs beyond the draft. */
export interface ReportValidationContext {
  /**
   * The current instant, used to derive "today".
   *
   * **Injected, never read from the ambient clock.** The comparison is by
   * UTC calendar day, so an injected instant and a parsed calendar date are
   * on the same clock by construction.
   */
  readonly now: Date;
  /** The deployment's configured campus areas. */
  readonly campusAreas: readonly CampusArea[];
  /** The image reference, when the upload succeeded. */
  readonly imageRef?: { readonly path: string } | null;
}

/**
 * Validate a submission.
 *
 * @returns the validated report's fields, ready to be persisted.
 * @throws {ValidationError} naming the offending field. The error carries the
 * **field name**, never the submitted value — the name is not sensitive, the
 * value might be (an over-long exact place is an FR-37 Sensitive Field).
 */
export function validateReportDraft(
  draft: ReportDraft,
  context: ReportValidationContext,
): ValidatedReport {
  const category = parseReportCategory(draft.category);
  const name = createReportName(draft.name);
  const description = createReportDescription(draft.description);
  const campusArea = createCampusAreaValue(draft.campusArea, context.campusAreas);
  const exactPlace = createExactPlace(draft.exactPlace);
  const identifyingDetails = createIdentifyingDetails(draft.identifyingDetails);

  const parsedDate = parseReportDate(draft.date);

  // The date bound is keyed on the type. The two branches are exhaustive, so
  // adding a third report type would be a compile error here rather than a
  // silent absence of a bound.
  const date = validateDateForType(parsedDate, draft.type, context.now);

  const createdAt = context.now;

  return {
    type: draft.type,
    name,
    category,
    description,
    date,
    campusArea,
    exactPlace,
    identifyingDetails,
    imageRef: context.imageRef ?? null,
    // The reporter is the acting member, server-derived. A new report is
    // `Open` — the only status this bolt writes.
    reporterId: '',
    status: 'Open' as ReportStatus,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Apply the per-type date bound.
 *
 * The switch is exhaustive over `ReportType`, so the compiler is the check
 * that no branch is missing — the same discipline `coding-standards.md`
 * requires for `ReportStatus`.
 */
function validateDateForType(
  date: ReturnType<typeof parseReportDate>,
  type: ReportType,
  now: Date,
): ReturnType<typeof parseReportDate> {
  switch (type) {
    case 'Lost':
      return validateDateLost(date, now);
    case 'Found':
      return validateDateFound(date, now);
    default: {
      const unreachable: never = type;
      throw new Error(`Unhandled report type: ${String(unreachable)}`);
    }
  }
}

/**
 * Attach the reporter and the status to a validated report.
 *
 * **Separate from the validation**, because the reporter is a fact about the
 * *actor*, not about the submission — it is derived server-side and is never
 * a request field. Keeping it out of the draft is what makes that
 * structural.
 */
export function withReporter(
  validated: ValidatedReport,
  reporterId: string,
): ValidatedReport {
  return { ...validated, reporterId };
}

/**
 * The report's type-dependent date bound, in days.
 *
 * Exposed so the application layer and the database constraint can be
 * asserted against the same number.
 */
export { dateMaxAgeDays } from './report-date';

/**
 * Re-exported so a caller that catches a field error has one import.
 *
 * `ValidationError` carries the field name, which is the whole of story
 * 003's "a field-level validation error identifies the offending field".
 */
export { ValidationError } from '@/lib/errors';
