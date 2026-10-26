/**
 * Audit-specific domain errors.
 *
 * These are typed and expected (coding-standards § Error handling): they are
 * business outcomes, not failures. Anything thrown that is not one of these is
 * a genuine defect and is logged as one.
 *
 * None of them ever surface raw text to a member.
 */

/**
 * An audit write was attempted outside the caller's transaction.
 *
 * The transaction handle is a required parameter of `AuditWriter.record`, so
 * reaching this error means a caller bypassed the type-level guarantee — a
 * genuine defect. The caller's transaction rolls back.
 */
export class AuditWriteOutsideTransactionError extends Error {
  constructor(message = 'An audit write cannot commit outside its caller transaction.') {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * A write carried a field the event's catalog entry does not name, or carried
 * a value that is barred everywhere (password, hash, token).
 *
 * The write is refused rather than silently coerced.
 */
export class AuditPayloadRejectedError extends Error {
  readonly eventType: string;
  readonly field: string;

  constructor(eventType: string, field: string, message?: string) {
    super(message ?? `Field "${field}" is not permitted on audit event "${eventType}".`);
    this.name = new.target.name;
    this.eventType = eventType;
    this.field = field;
  }
}

/**
 * The event number is outside the frozen catalog, or a numbered type carries
 * no number, or a number does not match its type.
 *
 * Refused before the insert. Numbering is frozen by the PRD, so an event 31
 * is a defect, not an extension.
 */
export class AuditCatalogViolationError extends Error {
  readonly eventType: string;
  readonly eventNumber: number | null;

  constructor(eventType: string, eventNumber: number | null, message?: string) {
    super(message ?? `Audit event "${eventType}" has an invalid catalog number (${eventNumber}).`);
    this.name = new.target.name;
    this.eventType = eventType;
    this.eventNumber = eventNumber;
  }
}
