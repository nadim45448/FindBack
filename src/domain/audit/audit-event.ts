/**
 * The `AuditEvent` entity and its construction rules.
 *
 * An audit event is constructed once and never mutated. It carries the actor,
 * the action, the target, the timestamp, and the event-specific fields its
 * catalog entry names.
 *
 * `occurredAt` is the moment of the *action*, not the moment of the write.
 * A write that lands later still records when the thing happened.
 *
 * Pure — no I/O, no framework imports.
 */

import { AuditCatalogViolationError } from './errors';
import { findCatalogEntryByType, requiredEventNumber } from './event-catalog';
import type { AuditActorRole, AuditParentType } from './event-catalog';

/** The parent an event hangs from. Decides the retention rule. */
export interface ParentRef {
  readonly parentType: AuditParentType;
  readonly parentId: string;
}

/**
 * The actor of an event.
 *
 * A `system` actor additionally names the human who caused the action, so no
 * event is anonymous. Deactivated actors remain named — the trail is never
 * back-filled to hide them.
 */
export interface ActorRef {
  readonly actorId: string;
  readonly actorRole: AuditActorRole;
  /** The acting administrator, for a system actor and for events 18/19. */
  readonly actingAdministratorId?: string | null;
  /** The owner who made the determination (events 18 and 19). */
  readonly determinedByUserId?: string | null;
  /** The administrator who recorded the determination (events 18 and 19). */
  readonly recordedByAdministratorId?: string | null;
}

/** The event-specific fields, already sanitized against the catalog. */
export type AuditPayload = Record<string, unknown>;

/** A draft of an audit event, before the entity validates it. */
export interface AuditEventDraft {
  readonly eventType: string;
  readonly parent: ParentRef;
  readonly actor: ActorRef;
  readonly payload?: AuditPayload;
  readonly reason?: string | null;
  readonly previousValues?: Record<string, unknown> | null;
  readonly changedFields?: Record<string, unknown> | null;
  readonly occurredAt?: Date;
}

/** A validated, immutable audit event. */
export interface AuditEvent {
  readonly id: string;
  readonly eventNumber: number | null;
  readonly eventType: string;
  readonly parent: ParentRef;
  readonly actor: ActorRef;
  readonly payload: AuditPayload;
  readonly reason: string | null;
  readonly previousValues: Record<string, unknown> | null;
  readonly changedFields: Record<string, unknown> | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

/**
 * The number the catalog assigns to an event type.
 *
 * @throws {AuditCatalogViolationError} when the type is not in the catalog, or
 * when a numbered type carries a mismatched number.
 */
export function resolveEventNumber(eventType: string, eventNumber?: number | null): number | null {
  const catalogEntry = findCatalogEntryByType(eventType);

  if (!catalogEntry) {
    throw new AuditCatalogViolationError(
      eventType,
      eventNumber ?? null,
      `Audit event type "${eventType}" is not in the frozen catalog.`,
    );
  }

  const required = requiredEventNumber(eventType);

  if (required === null) {
    if (eventNumber !== undefined && eventNumber !== null) {
      throw new AuditCatalogViolationError(
        eventType,
        eventNumber,
        `Audit event "${eventType}" is non-numbered and must not carry an event number.`,
      );
    }
    return null;
  }

  if (eventNumber !== undefined && eventNumber !== null && eventNumber !== required) {
    throw new AuditCatalogViolationError(
      eventType,
      eventNumber,
      `Audit event "${eventType}" is catalog number ${required}, not ${eventNumber}.`,
    );
  }

  return required;
}

/**
 * Validate a draft and return the field set to persist.
 *
 * The event number is derived from the catalog, never taken on trust, so a
 * caller cannot write a numbered event under a non-numbered type or invent
 * event 31.
 */
export function buildAuditEventFields(draft: AuditEventDraft): {
  eventNumber: number | null;
  eventType: string;
  parentType: AuditParentType;
  parentId: string;
  actorId: string;
  actorRole: AuditActorRole;
  actingAdministratorId: string | null;
  determinedByUserId: string | null;
  recordedByAdministratorId: string | null;
  reason: string | null;
  previousValues: Record<string, unknown> | null;
  changedFields: Record<string, unknown> | null;
  metadata: AuditPayload | null;
  occurredAt: Date;
} {
  const eventNumber = resolveEventNumber(draft.eventType);
  const occurredAt = draft.occurredAt ?? new Date();

  return {
    eventNumber,
    eventType: draft.eventType,
    parentType: draft.parent.parentType,
    parentId: draft.parent.parentId,
    actorId: draft.actor.actorId,
    actorRole: draft.actor.actorRole,
    actingAdministratorId: draft.actor.actingAdministratorId ?? null,
    determinedByUserId: draft.actor.determinedByUserId ?? null,
    recordedByAdministratorId: draft.actor.recordedByAdministratorId ?? null,
    reason: draft.reason ?? null,
    previousValues: draft.previousValues ?? null,
    changedFields: draft.changedFields ?? null,
    metadata: draft.payload && Object.keys(draft.payload).length > 0 ? draft.payload : null,
    occurredAt,
  };
}

/**
 * The invariants an `AuditEvent` must satisfy.
 *
 * These are checks over an assembled event — used by the writer before the
 * insert, and by tests. They are deliberately separate from construction so
 * that a value read back from the database can be checked the same way.
 */
export interface AppendOnlyGuard {
  readonly isAppendOnly: true;
  readonly hasUpdatePath: false;
  readonly hasDeletePath: false;
}

/**
 * The append-only guard.
 *
 * There is no update path and no delete path for an audit event, for any actor
 * including administrators. The value is a literal rather than a function
 * because the guarantee is structural: the repository interface has no such
 * method, so there is nothing to call.
 */
export const APPEND_ONLY_GUARD: AppendOnlyGuard = Object.freeze({
  isAppendOnly: true,
  hasUpdatePath: false,
  hasDeletePath: false,
});
