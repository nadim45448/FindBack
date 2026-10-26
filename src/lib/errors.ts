/**
 * Typed domain errors.
 *
 * These are expected business outcomes, not failures. Anything thrown that is
 * not one of these is a genuine defect and is logged as one.
 *
 * Expected errors never produce a stack trace in the response and never surface
 * raw text to a member. Copy comes from EXPERIENCE.md §4.9.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested entity does not exist, or is not visible to this actor. */
export class NotFoundError extends DomainError {}

/** The actor is not permitted to perform this action. */
export class PermissionDeniedError extends DomainError {}

/** The transition is not legal from the current status (FR-41, FR-42). */
export class IllegalTransitionError extends DomainError {}

/** The entity has reached a terminal status and accepts no further change. */
export class TerminalStateError extends DomainError {}

/** A free-tier quota has been reached; the action must be refused. */
export class QuotaExceededError extends DomainError {}

/** The request carried a value that is not valid for the field it names. */
export class ValidationError extends DomainError {
  /** The field that failed validation. */
  readonly field: string;

  constructor(field: string, message?: string) {
    super(message ?? `The value for "${field}" is not valid.`);
    this.name = new.target.name;
    this.field = field;
  }
}
