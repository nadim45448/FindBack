/**
 * The report field set — the closed set of field names a viewer may see.
 *
 * This is **one artefact with two consumers**: the projector reads it to
 * decide what to include in the response, and the infrastructure's select
 * builder reads it to decide what to `SELECT`. Because both read the same
 * set, a field cannot be selected but not projected, or projected but not
 * selected — the two cannot drift.
 *
 * **The field names, not the values.** The authorisation decision is the
 * *presence* of a name in the set. A value is never consulted to decide
 * whether to include it, which is what makes "the Sensitive Field is never
 * loaded" implementable rather than merely promised.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  grantsAuditTrail,
  grantsClaims,
  grantsRecoveryResponses,
  grantsReportContent,
  grantsSensitiveFields,
} from './visibility-resolver';
import type { ProjectionColumn } from './projection-column';

/**
 * The report fields the matrix can grant.
 *
 * `summary` is the FR-38 set and the base of every column. The five
 * Sensitive members are FR-37 and are present **only** in the owner columns
 * and the administrator column.
 */
export const REPORT_FIELDS = [
  'summary',
  'description',
  'image',
  'reporterName',
  'statusHistory',
  'exactPlace',
  'identifyingDetails',
  'reporterEmail',
  'reporterPhone',
] as const;

/** One of the report fields the matrix can grant. */
export type ReportField = (typeof REPORT_FIELDS)[number];

/**
 * The FR-37 Sensitive report fields.
 *
 * These are present only in a field set that grants sensitive fields.
 */
export const SENSITIVE_REPORT_FIELDS: readonly ReportField[] = [
  'exactPlace',
  'identifyingDetails',
  'reporterEmail',
  'reporterPhone',
];

/**
 * The fields that make up the FR-38 public summary set.
 *
 * These are the fields an anonymous viewer sees in a public summary listing,
 * and the base every other column includes.
 */
export const SUMMARY_FIELDS: readonly ReportField[] = ['summary'];

/**
 * The set of report fields a viewer may see.
 *
 * A set, not a list, because membership is the question the authorisation
 * asks. It is readonly and frozen so a projector cannot widen it after the
 * fact.
 */
export type ReportFieldSet = ReadonlySet<ReportField>;

/** Build a field set from a list of field names. */
export function fieldSetOf(fields: readonly ReportField[]): ReportFieldSet {
  return new Set(fields);
}

/**
 * The report fields a column set grants.
 *
 * The rules, in the matrix's own order:
 *
 * 1 - `summary` is always present. It is the FR-38 set.
 * 2 - `description`, `image`, `reporterName`, and `statusHistory` are present
 *    whenever the columns include any authenticated column.
 * 3 - `exactPlace`, `identifyingDetails`, `reporterEmail`, and `reporterPhone`
 *    are present **only** when the columns include an owner column or the
 *    administrator column.
 *
 * **`reporterPhone` is granted but never supplied.** FR-37 names the
 * reporter's phone a Sensitive Field *"if collected — FindBack does not
 * require phone"*, and it is not collected: the `accounts` table has no
 * such column, and no requirement collects one. The **grant stays** — a
 * field can be sensitive and never present, and the rule must still be
 * enforced the day a column is added — while the **query never selects
 * it**, because there is nothing to select. The projection therefore
 * leaves the key off entirely.
 *
 * So the field set and the `SELECT` list deliberately disagree here, and
 * that disagreement is the finding rather than a defect. Do not "fix" it
 * by deleting the grant.
 *
 * The anonymous column gets `summary` alone — and in practice never reaches
 * a detail projector at all, because FR-38 provides no anonymous detail page.
 */
export function reportFieldsFor(columns: readonly ProjectionColumn[]): ReportFieldSet {
  const fields: ReportField[] = ['summary'];

  if (grantsReportContent(columns)) {
    fields.push('description', 'image', 'reporterName', 'statusHistory');
  }

  if (grantsSensitiveFields(columns)) {
    fields.push('exactPlace', 'identifyingDetails', 'reporterEmail', 'reporterPhone');
  }

  return fieldSetOf(fields);
}

/**
 * The set of related-record collections a column set grants.
 *
 * Split out from the report field set because these are *collections*, not
 * fields — a Claim is not a field of a report. But they are governed by the
 * same matrix, and the select builder reads them the same way.
 */
export interface RelatedRecordGrants {
  readonly claims: boolean;
  readonly recoveryResponses: boolean;
  readonly threads: boolean;
  readonly auditTrail: boolean;
}

/**
 * The related records a column set grants.
 *
 * A thread's visibility is exactly its parent's visibility, so there is no
 * independent rule for threads: the grants follow the Claims and the
 * Recovery Responses.
 */
export function relatedRecordGrantsFor(
  columns: readonly ProjectionColumn[],
): RelatedRecordGrants {
  const claims = grantsClaims(columns);
  const recoveryResponses = grantsRecoveryResponses(columns);

  return {
    claims,
    recoveryResponses,
    threads: claims || recoveryResponses,
    auditTrail: grantsAuditTrail(columns),
  };
}
