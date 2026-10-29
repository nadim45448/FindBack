/**
 * The report **edit** request parser.
 *
 * **The parser names each field it reads, and only the fields an edit may
 * change.** An edit is a *partial* submission: a field the member left alone
 * is absent, and absent means "unchanged". So the parser reads the seven
 * editable content fields and **drops everything else** — `type`, `status`,
 * `reporterId`, and any unknown key.
 *
 * **This is the closed-by-construction mechanism again, one level up.** The
 * create parser drops unknown keys so they cannot become stored columns; the
 * edit parser drops unknown keys so they cannot become *changes*. A request
 * carrying `{"status": "Closed"}` on an edit has that key dropped before the
 * service sees it — so the edit structurally cannot change the status, which
 * is FR-9's rule expressed as a fact rather than as a check.
 *
 * **A field that is present must be a string or `null`.** A field that is
 * present but of the wrong type is a **shape** error rather than an absent
 * field: the client sent something, and silently dropping it would let the
 * client believe it had set the field.
 */

import { ValidationError } from '@/lib/errors';

import type { ReportDraft } from '@/domain/listings';

/** The editable content fields, in the order the parser reads them. */
const EDITABLE_FIELDS = [
  'name',
  'category',
  'description',
  'date',
  'campusArea',
  'exactPlace',
  'identifyingDetails',
] as const;

/**
 * The submitted changes.
 *
 * **Every field is optional.** A field the member did not change is absent
 * from the object, and absent means "unchanged" — the service merges the
 * submission over the stored report before it validates.
 */
export type ReportEditChanges = Partial<ReportDraft>;

/**
 * Parse a JSON request body into an edit's changes.
 *
 * @throws {MalformedRequestError} when the body is not a JSON object.
 * @throws {ValidationError} when a present field is neither a string nor
 * `null`.
 */
export function parseReportEditBody(body: Record<string, unknown>): ReportEditChanges {
  const changes: Record<string, unknown> = {};

  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) {
      continue;
    }

    const value = body[field];

    if (value === undefined || value === null) {
      changes[field] = null;
      continue;
    }

    if (typeof value !== 'string') {
      throw new ValidationError(field, `The "${field}" field must be text.`);
    }

    changes[field] = value;
  }

  return changes as ReportEditChanges;
}
