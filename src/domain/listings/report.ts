/**
 * The `Report` entity and the `ReportDraft` it is built from.
 *
 * **The FR-8 field set is authoritative and closed.** "No field beyond this
 * set is stored on a Report" (story 001's technical note) is not a
 * convention here; it is an invariant of the aggregate, and it is what makes
 * FR-14 search, FR-37 sensitivity, and FR-39 projection composable — each
 * of them reasons over a known, closed set of fields.
 *
 * **The draft has a fixed shape and no index signature.** That is the
 * mechanism by which the closure is *structural*: a request carrying an
 * unknown key cannot become a stored column, because there is nowhere for it
 * to go. The route's parser names each field it reads, and the draft type
 * has no `extra` bag.
 *
 * **The validator is the only path to a `Report`.** A `Report` that validates
 * itself must already exist to be validated, so the invariants would be
 * checked after construction rather than enforced by it. Instead the
 * validator is the only constructor, so a `Report` that exists is a `Report`
 * that passed — the same reasoning bolt `006` used for the `Viewer`.
 *
 * Pure — no I/O, no framework imports.
 */

import type { CampusAreaValue } from './campus-area-value';
import type { ExactPlace } from './exact-place';
import type { IdentifyingDetails } from './identifying-details';
import type { ImageRef } from './image-ref';
import type { ReportCategory } from './report-category';
import type { ReportDate } from './report-date';
import type { ReportDescription } from './report-description';
import type { ReportName } from './report-name';
import type { ReportStatus } from './report-status';
import type { ReportType } from './report-type';

/**
 * The submitted fields, before validation.
 *
 * **Every field is a raw `string`.** The draft holds what the client sent;
 * the value objects hold what was accepted. Keeping the two apart means the
 * draft is a faithful record of the submission and the entity is a faithful
 * record of the decision.
 *
 * **The shape is closed.** There is no index signature and no catch-all
 * field. An unknown key in the request body is dropped by the parser and has
 * no way to reach this type.
 */
export interface ReportDraft {
  readonly type: ReportType;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  /** An ISO calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly campusArea: string;
  readonly exactPlace?: string | null;
  readonly identifyingDetails?: string | null;
}

/** The fields a `Report` was built from. */
export interface ReportDraftParams {
  readonly type: ReportType;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly date: string;
  readonly campusArea: string;
  readonly exactPlace?: string | null;
  readonly identifyingDetails?: string | null;
}

/**
 * Build a draft.
 *
 * The fields are listed one by one, so a caller cannot smuggle an extra one
 * in. This is the point where the request's shape stops being the caller's
 * problem.
 */
export function createReportDraft(params: ReportDraftParams): ReportDraft {
  return {
    type: params.type,
    name: params.name,
    category: params.category,
    description: params.description,
    date: params.date,
    campusArea: params.campusArea,
    exactPlace: params.exactPlace ?? null,
    identifyingDetails: params.identifyingDetails ?? null,
  };
}

/**
 * A Lost or Found item report.
 *
 * The aggregate root. Its `type` is set at creation and **never changes** —
 * it anchors FR-10's interaction rule, FR-11's withdrawal rule, and FR-39's
 * split owner columns.
 */
export interface Report {
  readonly id: string;
  readonly type: ReportType;
  readonly status: ReportStatus;
  readonly name: ReportName;
  readonly category: ReportCategory;
  readonly description: ReportDescription;
  readonly date: ReportDate;
  readonly campusArea: CampusAreaValue;
  /** An FR-37 Sensitive Field. */
  readonly exactPlace: ExactPlace | null;
  /** An FR-37 Sensitive Field. */
  readonly identifyingDetails: IdentifyingDetails | null;
  /** An FR-37 Sensitive Field. */
  readonly imageRef: ImageRef | null;
  /** The acting member. Server-derived, never client-asserted. */
  readonly reporterId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * The fields a validated `Report` carries, **before it has an id**.
 *
 * The id is assigned by the repository, because an id is minted once and
 * `createdAt` records when the row was written — so the thing that is
 * validated is not the same shape as the thing that is stored. The
 * repository's `create` takes this shape and returns a `Report`.
 */
export interface ValidatedReport {
  readonly type: ReportType;
  readonly name: ReportName;
  readonly category: ReportCategory;
  readonly description: ReportDescription;
  readonly date: ReportDate;
  readonly campusArea: CampusAreaValue;
  readonly exactPlace: ExactPlace | null;
  readonly identifyingDetails: IdentifyingDetails | null;
  readonly imageRef: ImageRef | null;
  readonly reporterId: string;
  readonly status: ReportStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A report that has been persisted — the `ValidatedReport` plus its id.
 *
 * The distinction is what makes "the id is minted once" true: the id is
 * absent from the validated shape and present on the persisted one, so it
 * cannot be supplied by a caller or invented by the domain.
 */
export interface PersistedReport extends ValidatedReport {
  readonly id: string;
}

/**
 * The optional fields' **presence** flags.
 *
 * These are what the audit trail records for event 1 — the catalog names no
 * Sensitive Field for that event, so the trail records *that* a report has
 * identifying details, not what they are.
 */
export interface OptionalFieldPresence {
  readonly exactPlace: boolean;
  readonly identifyingDetails: boolean;
}

/** The presence flags for a report's optional Sensitive Fields. */
export function optionalFieldPresence(report: {
  readonly exactPlace: unknown;
  readonly identifyingDetails: unknown;
}): OptionalFieldPresence {
  return {
    exactPlace: report.exactPlace !== null && report.exactPlace !== undefined,
    identifyingDetails:
      report.identifyingDetails !== null && report.identifyingDetails !== undefined,
  };
}
