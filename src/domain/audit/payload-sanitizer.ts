/**
 * Catalog-aware payload sanitizer (FR-37 guard).
 *
 * **Deny by default.** A field is written to the trail only when the event's
 * catalog entry names it. A field the catalog does not name is refused, not
 * dropped — a silently discarded field is a silently incomplete audit record.
 *
 * The sensitive-value rule is scoped precisely, and this is deliberate:
 *
 * | Value                        | Audit trail                | Operational log |
 * | ---------------------------- | -------------------------- | --------------- |
 * | Claim reason (event 2)       | Recorded — catalog-named   | Never           |
 * | Identifying details (2, 15)  | Recorded — catalog-named   | Never           |
 * | Thread message text (14, 16) | Recorded — catalog-named   | Never           |
 * | Password, hash, token        | Never                      | Never           |
 * | Report exact place free text | Never — no catalog names it | Never           |
 *
 * The trail is administrator-only (FR-32) and the UX spine (§17.2) renders
 * these as expandable "Show details" rows for administrators, so a rule that
 * forbade them in the record would make the frozen UX unimplementable.
 *
 * Pure — no I/O, no framework imports.
 */

import { AuditPayloadRejectedError } from './errors';
import { permittedFieldsFor, sensitiveFieldsFor } from './event-catalog';

/**
 * Values that are barred everywhere — in the trail and in any log.
 *
 * Matched case-insensitively against the field name, and the value's own
 * shape is checked separately by `looksLikeSecret`.
 */
const ALWAYS_BARRED_FIELDS: readonly string[] = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'sessionToken',
  'session_token',
  'sessionId',
  'session_id',
  'secret',
  'apiKey',
  'api_key',
  'credential',
  'hash',
];

/**
 * A field name that is always barred, whatever the catalog says.
 *
 * The catalog is frozen and names none of these, but the check is
 * independent so that a future catalog edit cannot accidentally open one.
 */
export function isAlwaysBarredField(field: string): boolean {
  return ALWAYS_BARRED_FIELDS.some((barred) => barred.toLowerCase() === field.toLowerCase());
}

/**
 * True when a value looks like a credential rather than a description.
 *
 * A heuristic, used to catch a secret that was stuffed into a permitted
 * field. It errs towards refusing.
 */
export function looksLikeSecret(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  // A bcrypt/argon hash, or a long hex/base64 blob.
  if (/^\$2[aby]?\$/.test(value)) {
    return true;
  }
  if (/^[a-f0-9]{64,}$/i.test(value)) {
    return true;
  }
  // A JWT.
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return true;
  }
  // A prefixed secret, e.g. `sk_live_…`, `ghp_…`.
  if (/^(sk|pk|rk|ghp|gho|ghu|ghs|xox[baprs])[-_][A-Za-z0-9_-]{8,}$/.test(value)) {
    return true;
  }

  return false;
}

/** The result of sanitizing a payload. */
export interface SanitizedPayload {
  readonly fields: Record<string, unknown>;
  /** The sensitive fields this event was permitted to carry. */
  readonly sensitiveFieldsCarried: readonly string[];
}

/**
 * Options for sanitizing.
 *
 * `eventType` decides which fields are permitted — the guard is catalog-aware
 * rather than a blanket list.
 */
export interface SanitizeOptions {
  readonly eventType: string;
  /**
   * When true, a permitted field that carries a sensitive value is still
   * written. This is the trail's mode: the PRD names the field, and the trail
   * is administrator-only.
   */
  readonly allowCatalogNamedSensitiveValues: boolean;
}

/**
 * Sanitize a payload for the given event type.
 *
 * @throws {AuditPayloadRejectedError} when a field is not named by the
 * catalog, is always barred, or carries a secret-looking value in a field the
 * catalog does not mark sensitive.
 */
export function sanitizePayload(
  payload: Record<string, unknown>,
  options: SanitizeOptions,
): SanitizedPayload {
  const { eventType, allowCatalogNamedSensitiveValues } = options;

  const permitted = new Set(permittedFieldsFor(eventType));
  const sensitive = new Set(sensitiveFieldsFor(eventType));
  const accepted: Record<string, unknown> = {};
  const sensitiveCarried: string[] = [];

  for (const [field, value] of Object.entries(payload)) {
    if (isAlwaysBarredField(field)) {
      throw new AuditPayloadRejectedError(
        eventType,
        field,
        `Field "${field}" is a credential and is never written to the audit trail.`,
      );
    }

    if (!permitted.has(field)) {
      throw new AuditPayloadRejectedError(
        eventType,
        field,
        `Field "${field}" is not named by the catalog entry for audit event "${eventType}".`,
      );
    }

    if (looksLikeSecret(value)) {
      // A credential is barred everywhere — in the trail and in any log. A
      // field the catalog marks sensitive may carry an FR-37 value, but it may
      // never carry a credential, and the check does not depend on the field's
      // sensitivity to hold.
      throw new AuditPayloadRejectedError(
        eventType,
        field,
        `Field "${field}" on audit event "${eventType}" carries a value that looks like a credential.`,
      );
    }

    if (sensitive.has(field)) {
      // A field the catalog marks sensitive may carry an FR-37 value. That is
      // permitted on the trail, where the PRD names it and the audience is
      // administrators. In any other context it is refused.
      if (!allowCatalogNamedSensitiveValues) {
        throw new AuditPayloadRejectedError(
          eventType,
          field,
          `Field "${field}" carries a sensitive value and cannot be recorded in this context.`,
        );
      }
      sensitiveCarried.push(field);
    }

    accepted[field] = value;
  }

  return { fields: accepted, sensitiveFieldsCarried: sensitiveCarried };
}

/**
 * Sanitize a payload for the administrator-visible audit trail.
 *
 * Catalog-named sensitive values are permitted, because the PRD names them for
 * that event and the trail is administrator-only.
 */
export function sanitizeForTrail(
  eventType: string,
  payload: Record<string, unknown>,
): SanitizedPayload {
  return sanitizePayload(payload, { eventType, allowCatalogNamedSensitiveValues: true });
}
