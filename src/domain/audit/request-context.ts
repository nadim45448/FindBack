/**
 * The operational log value object.
 *
 * `RequestContext` is a **closed** shape: it has exactly the fields a log
 * line is allowed to carry, and no field capable of holding a sensitive
 * value. The type, not a runtime check, is the control — a developer cannot
 * log a Claim reason because there is nowhere to put one.
 *
 * This is the counterpart to the trail: the trail may carry a catalog-named
 * sensitive value (FR-32, administrator-only), the log never may.
 *
 * Pure — no I/O, no framework imports.
 */

/** The actor role. Matches the audit trail's role vocabulary. */
export type LogActorRole = 'member' | 'administrator' | 'system' | 'anonymous';

/** The outcome of an operation. */
export type LogOutcome = 'success' | 'denied' | 'error';

/**
 * A single operational log line's context.
 *
 * Every field is either an identifier, a verb, or an outcome. There is no
 * free-text field, so no free text can reach the log.
 */
export interface RequestContext {
  /** Present on every line (PRD §10). */
  readonly requestId: string;
  readonly actorId?: string;
  readonly actorRole: LogActorRole;
  /** The action performed, e.g. `claim.approved`. */
  readonly action: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly outcome: LogOutcome;
  /** ISO-8601 timestamp. */
  readonly ts: string;
}

/**
 * Build a request context, filling in the timestamp.
 *
 * A factory rather than a plain object literal, so the `ts` field cannot be
 * forgotten.
 */
export function createRequestContext(
  context: Omit<RequestContext, 'ts'> & { ts?: string },
): RequestContext {
  return {
    ...context,
    ts: context.ts ?? new Date().toISOString(),
  };
}
