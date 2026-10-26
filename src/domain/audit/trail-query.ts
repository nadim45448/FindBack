/**
 * The trail query value objects.
 *
 * A trail read is a *filtered, ordered, paginated* request for audit events.
 * These objects make that request explicit and closed, so the route boundary
 * cannot express a filter the design has not settled.
 *
 * **The filter set is closed at three** (ADR-8): action type (multi-select),
 * date range, and actor. There is no free-text filter and no sort control —
 * the trail's order is fixed reverse-chronologically by FR-32 and UX-OQ-C, and
 * a free-text filter would reach into `reason` and `metadata`, which can carry
 * audit-significant text and Sensitive Fields.
 *
 * **The cursor is opaque.** It is base64url-encoded JSON carrying
 * `{occurredAt, id}`. It is not interpreted by the client, and nothing in it
 * is ever interpolated into a query — the two fields are bound as parameters.
 *
 * Pure — no I/O, no framework imports.
 */

import type { AuditParentType } from './event-catalog';

/**
 * The parent types a trail can be read for.
 *
 * Mirrors the catalog's `AuditParentType`, kept as a separate alias so the
 * query module does not depend on the event catalog's internals.
 */
export type TrailParentType = AuditParentType;

/** The trail's parent types, as a runtime list for validation. */
export const TRAIL_PARENT_TYPES: readonly TrailParentType[] = [
  'report',
  'claim',
  'recovery_response',
  'account',
  'claim_thread_message',
  'recovery_response_thread_message',
];

/**
 * The three filters UX §17.3 settles.
 *
 * Every filter is optional. A filter that is absent omits its clause
 * entirely — a filter that is always present with a sentinel value would
 * return nothing, which is the wrong default.
 */
export interface TrailFilters {
  /** Action-type filter. Multi-select: an empty array means "no filter". */
  readonly eventTypes?: readonly string[];
  /** Inclusive lower bound on `occurredAt`. */
  readonly from?: Date | null;
  /** Inclusive upper bound on `occurredAt`. */
  readonly to?: Date | null;
  /** Actor filter. */
  readonly actorId?: string | null;
}

/** A filter set with nothing applied. */
export const NO_TRAIL_FILTERS: TrailFilters = Object.freeze({});

/**
 * A trail request.
 *
 * `parentType` and `parentId` together identify the parent whose trail is
 * read. A whole-trail read carries neither.
 */
export interface TrailQuery {
  readonly parentType?: TrailParentType | null;
  readonly parentId?: string | null;
  readonly filters?: TrailFilters;
  /** The cursor position. Null means the start of the trail. */
  readonly cursor?: TrailCursor | null;
  /** The requested page size. Clamped to the page size, never rejected. */
  readonly limit?: number | null;
}

/**
 * The cursor position in the trail.
 *
 * A strict tuple on `(occurredAt, id)`, so two events sharing a timestamp
 * cannot cause a skipped or repeated row. The `id` tiebreaker is not
 * optional — `occurredAt` alone is not unique.
 */
export interface TrailCursor {
  readonly occurredAt: Date;
  readonly id: string;
}

/** The maximum entries on one page. */
export const TRAIL_PAGE_SIZE = 25;

/**
 * Clamp a requested page size to the trail page size.
 *
 * The page size is a property of the view, not a negotiation with the client,
 * so a caller asking for more is capped rather than refused.
 */
export function clampTrailLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit)) {
    return TRAIL_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), TRAIL_PAGE_SIZE);
}

/**
 * Whether a parent type is one the trail can be read for.
 *
 * Used at the route boundary, where an unknown parent type is a `400` rather
 * than a query that returns nothing.
 */
export function isTrailParentType(value: string): value is TrailParentType {
  return (TRAIL_PARENT_TYPES as readonly string[]).includes(value);
}

/**
 * Encode a cursor as an opaque token.
 *
 * base64url, so the token is URL-safe without further escaping.
 */
export function encodeTrailCursor(cursor: TrailCursor): string {
  const payload = JSON.stringify({
    occurredAt: cursor.occurredAt.toISOString(),
    id: cursor.id,
  });

  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decode an opaque cursor token.
 *
 * Returns null for a token that is not a cursor. The caller decides what a
 * malformed cursor means — at the route boundary it is a `400`, because
 * silently treating it as "start of the trail" would silently show the
 * administrator a different page than the one they asked for.
 *
 * The two fields are extracted and nothing else is read from the token, and
 * both are bound as parameters downstream, so a tampered token cannot escape
 * the query.
 */
export function decodeTrailCursor(token: string | null | undefined): TrailCursor | null {
  if (!token) {
    return null;
  }

  let payload: unknown;

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    payload = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const candidate = payload as { occurredAt?: unknown; id?: unknown };

  if (typeof candidate.occurredAt !== 'string' || typeof candidate.id !== 'string') {
    return null;
  }

  const occurredAt = new Date(candidate.occurredAt);

  if (Number.isNaN(occurredAt.getTime()) || candidate.id.length === 0) {
    return null;
  }

  return { occurredAt, id: candidate.id };
}

/**
 * The filters as a record, for the read log.
 *
 * The read record captures what the administrator asked for. The values are
 * stored as **data** — never interpolated into a query — so a hostile filter
 * value is recorded verbatim and never executed.
 *
 * The record carries no trail content: a read log is a record of *access*,
 * not a second copy of the trail.
 */
export function describeTrailFilters(filters: TrailFilters | null | undefined): {
  eventTypes: string[] | null;
  from: string | null;
  to: string | null;
  actorId: string | null;
} {
  return {
    eventTypes:
      filters?.eventTypes && filters.eventTypes.length > 0 ? [...filters.eventTypes] : null,
    from: filters?.from ? filters.from.toISOString() : null,
    to: filters?.to ? filters.to.toISOString() : null,
    actorId: filters?.actorId ?? null,
  };
}

/**
 * The query as a short string, for the read log.
 *
 * Describes *what* was read without carrying any trail content — the parent
 * and the scope, never an event, a reason, or a message.
 */
export function describeTrailQuery(query: TrailQuery): string {
  if (query.parentType && query.parentId) {
    return `${query.parentType}:${query.parentId}`;
  }

  return 'all';
}
