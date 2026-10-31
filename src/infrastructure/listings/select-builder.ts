/**
 * The select builder — the mechanism that makes FR-39's "never loaded"
 * structural.
 *
 * **A Sensitive Field is not loaded for an actor who may not see it.** This
 * is not a filter over a fully-loaded row; it is the absence of the column
 * from the `SELECT` list. The PRD is explicit: "the Sensitive Field is never
 * loaded at all, because filtering an already-loaded value after the fact is
 * not sufficient."
 *
 * **The builder is a pure function from a column set to a list of column
 * names.** It is read by the projectors (through the shared field set) and
 * by the query builders, so the field set is **one artefact with two
 * consumers** — the query and the projection cannot drift.
 *
 * The builder's input is a `ProjectionColumn[]`, which is a **closed and
 * exhaustive** set. A caller can never pass a field name, so there is no way
 * to widen the grant by passing a string.
 *
 * Pure — no I/O, no framework imports, no Prisma. That is what makes it
 * testable by asserting on the generated SQL string without a database.
 */

import {
  grantsAuditTrail,
  grantsRecoveryResponses,
  grantsReportContent,
  grantsSensitiveFields,
  type ProjectionColumn,
} from '@/domain/listings';

/**
 * The `reports` columns, in the order they are selected.
 *
 * The names are the **camelCase Prisma field names**, and the reader maps
 * them to physical columns. Keeping the mapping in one place means a
 * column rename is a one-line change.
 */
const REPORT_SELECT = {
  base: ['id', 'type', 'status'] as const,
  summary: ['name', 'category', 'date', 'campusArea'] as const,
  content: ['description', 'imageRef', 'reporterId'] as const,
  sensitive: ['exactPlace', 'identifyingDetails'] as const,
} as const;

/**
 * The `accounts` columns, joined for the reporter.
 *
 * `displayName` is the reporter's display name, which every authenticated
 * viewer may see. `email` is an FR-37 Sensitive Field.
 *
 * **There is no `phone` column.** FR-37 names the reporter's phone a
 * Sensitive Field *"if collected — FindBack does not require phone"*, and
 * it is not collected: no requirement collects one, no story collects one,
 * and the identity bolt's `accounts` table has never had the column.
 * Selecting it would be a query error at runtime, so it is not selected —
 * for **any** column set, including the owner's and the administrator's.
 *
 * **The matrix keeps the grant; the query cannot honour it.** The domain's
 * `reporterPhone` stays in the FR-37 Sensitive Field set, because a field
 * can be sensitive and never present, and the rule must still be there
 * the day a column is added. What changes is the *projection*: the reader
 * never supplies a value, so the projector leaves the key off entirely.
 *
 * So the two layers deliberately disagree — the matrix says "the owner may
 * see the reporter's phone" and the query says "there is nothing to
 * select". **The disagreement is the finding, not a defect**, and a test
 * asserts the query's side of it.
 */
const REPORTER_SELECT = {
  name: ['displayName'] as const,
  contact: ['email'] as const,
};

/** The `claims` columns. */
const CLAIM_SELECT = {
  base: ['id', 'reportId', 'claimantId', 'status', 'submittedAt'] as const,
  evidence: ['reason', 'identifyingDetails', 'dateLost'] as const,
} as const;

/** The `recovery_responses` columns. */
const RESPONSE_SELECT = {
  /**
   * The base columns.
   *
   * **`campusArea` is a base column, not a sensitive one.** FR-44's
   * where-found area is the deployment's campus-area enum — the same
   * enumeration the report's own campus area uses — and it is not one of
   * FR-37's Sensitive Fields. §9.6 lists it beside the exact place as one
   * of the response's two where-found fields, and it is granted with the
   * response itself.
   */
  base: ['id', 'reportId', 'responderId', 'status', 'submittedAt', 'campusArea'] as const,
  sensitive: [
    'whereFoundExactPlace',
    'observedIdentifyingDetails',
    'dateFound',
    'candidateImageRef',
  ] as const,
} as const;

/** The `thread_messages` columns. */
const THREAD_SELECT = [
  'id',
  'parentType',
  'parentId',
  'authorDisplayName',
  'body',
  'postedAt',
] as const;

/**
 * The `audit_events` columns.
 *
 * **Only the timestamp is ever selected for a non-administrator.** An audit
 * event row carries the actor, the event type, the reason, and the
 * metadata — all of which are trail content (FR-32). The member-facing
 * status history is the report's status plus the timestamp of its most
 * recent event, and **nothing else**.
 */
const AUDIT_SELECT = {
  /** The full event, for an administrator. */
  full: [
    'id',
    'eventNumber',
    'eventType',
    'parentType',
    'parentId',
    'actorId',
    'actorRole',
    'reason',
    'previousValues',
    'changedFields',
    'metadata',
    'occurredAt',
    'createdAt',
  ] as const,
  /** The timestamp alone, for the member-facing status history. */
  timestampOnly: ['occurredAt'] as const,
};

/**
 * The `reports` columns a column set authorises.
 *
 * **The summary columns are unconditional.** The FR-38 summary set is the
 * base every column includes — it is what an anonymous viewer sees in a
 * public listing, and it is granted by every column. The content columns
 * are what the authenticated columns add on top of it.
 *
 * **The Sensitive columns are absent for every column set that does not
 * grant them.** An unrelated member's list has no `exactPlace` and no
 * `identifyingDetails`; a claimant's list has neither either.
 */
export function reportSelectColumns(columns: readonly ProjectionColumn[]): readonly string[] {
  const selected: string[] = [...REPORT_SELECT.base];

  selected.push(...REPORT_SELECT.summary);

  if (grantsReportContent(columns)) {
    selected.push(...REPORT_SELECT.content);
  }

  if (grantsSensitiveFields(columns)) {
    selected.push(...REPORT_SELECT.sensitive);
  }

  return selected;
}

/**
 * The `accounts` columns a column set authorises, joined for the reporter.
 *
 * Returns an empty array when the columns grant neither the reporter's name
 * nor their contact details — which means **the join is not issued at all**.
 */
export function reporterSelectColumns(columns: readonly ProjectionColumn[]): readonly string[] {
  const selected: string[] = [];

  if (grantsReportContent(columns)) {
    selected.push(...REPORTER_SELECT.name);
  }

  if (grantsSensitiveFields(columns)) {
    selected.push(...REPORTER_SELECT.contact);
  }

  return selected;
}

/**
 * The `claims` columns a column set authorises.
 *
 * The claimant's `reason` and `identifyingDetails` are FR-37 Sensitive
 * Fields, so they are absent for the Found-report owner — who sees that a
 * Claim exists, its status, and its thread, but never the private evidence.
 */
export function claimSelectColumns(columns: readonly ProjectionColumn[]): readonly string[] {
  const selected: string[] = [...CLAIM_SELECT.base];

  if (columns.includes('administrator')) {
    selected.push(...CLAIM_SELECT.evidence);
  }

  return selected;
}

/**
 * The `recovery_responses` columns a column set authorises.
 *
 * The responder-supplied fields are FR-37 Sensitive Fields, so they are
 * absent for a column set that may not see this response at all.
 */
export function responseSelectColumns(columns: readonly ProjectionColumn[]): readonly string[] {
  const selected: string[] = [...RESPONSE_SELECT.base];

  if (grantsRecoveryResponses(columns)) {
    selected.push(...RESPONSE_SELECT.sensitive);
  }

  return selected;
}

/** The `thread_messages` columns. The same for every column set. */
export function threadSelectColumns(): readonly string[] {
  return [...THREAD_SELECT];
}

/**
 * The `audit_events` columns a column set authorises.
 *
 * An administrator receives the **full** event. Anyone else receives
 * **nothing** — the trail is administrator-only, and the member-facing
 * status history is read separately as a timestamp alone.
 */
export function auditSelectColumns(columns: readonly ProjectionColumn[]): readonly string[] {
  if (grantsAuditTrail(columns)) {
    return [...AUDIT_SELECT.full];
  }

  return [];
}

/**
 * The `audit_events` columns for the **member-facing status history**.
 *
 * **The timestamp alone.** The report's most recent event contributes its
 * `occurred_at` and nothing else — no event type, no actor, no reason, no
 * metadata. That is the difference between the member-facing status history
 * (which every authenticated viewer receives) and the audit trail (which
 * only an administrator receives).
 */
export function lastActionTimestampColumns(): readonly string[] {
  return [...AUDIT_SELECT.timestampOnly];
}

/**
 * A `SELECT` list as a SQL fragment.
 *
 * **The names are not interpolated from user input** — they come from the
 * constant lists above, so there is nothing to inject. The function exists so
 * the query builders have one place to render a list, and so a test can
 * assert on the rendered SQL.
 */
export function renderSelectList(columns: readonly string[]): string {
  return columns.length > 0 ? columns.join(', ') : 'NULL';
}
