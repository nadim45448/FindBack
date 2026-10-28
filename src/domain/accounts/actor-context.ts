/**
 * The `ActorContext` — the identity every downstream unit consumes.
 *
 * **This is where the `Pending` restriction is enforced, once.** Story 006's
 * technical note is explicit: "The restriction is enforced once, at the
 * `ActorContext` boundary, not re-implemented per unit." A downstream unit
 * asks the context what the actor may do; it does not re-read the account and
 * it does not write its own `if (status !== 'Active')` guard.
 *
 * The context carries the **status** so a downstream unit never re-derives
 * it from a database read (story 006 criterion 5).
 *
 * **A per-request value, never cached across requests.** A stale cached
 * context after deactivation is impossible by construction (story 006's edge
 * case) — the context is resolved from the database on every request.
 *
 * Pure — no I/O, no framework imports.
 */

import type { AccountCapability, AccountStatus } from './account-status';

/** The resolved identity of a request's actor. */
export interface ActorContext {
  readonly actorId: string;
  readonly status: AccountStatus;
  readonly isAdministrator: boolean;
  readonly displayName: string;
  /** The capability the status confers. */
  readonly capability: AccountCapability;
}

/** The fields an actor context is built from. */
export interface ActorContextParams {
  readonly actorId: string;
  readonly status: AccountStatus;
  readonly isAdministrator: boolean;
  readonly displayName: string;
}

/**
 * Build an actor context.
 *
 * **The administrator flag is honoured only on an `Active` account.** A
 * `Pending` account with the flag set is still restricted — the flag alone
 * grants nothing before approval (story 006's edge case).
 */
export function createActorContext(params: ActorContextParams): ActorContext {
  const isActive = params.status === 'Active';

  return {
    actorId: params.actorId,
    status: params.status,
    isAdministrator: isActive && params.isAdministrator,
    displayName: params.displayName,
    capability: isActive ? 'member' : 'none',
  };
}

/**
 * True when the actor may act as a member.
 *
 * The one question a downstream unit asks. There is deliberately **no**
 * "what is this account's status" accessor that invites a caller to ask the
 * wrong question.
 */
export function hasMemberCapability(actor: ActorContext): boolean {
  return actor.capability === 'member';
}

/**
 * True when the actor may act as an administrator.
 */
export function hasAdministratorCapability(actor: ActorContext): boolean {
  return actor.capability === 'member' && actor.isAdministrator;
}
