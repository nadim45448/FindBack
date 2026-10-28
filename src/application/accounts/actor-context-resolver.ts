/**
 * The actor-context resolver.
 *
 * **The single place a request's actor is determined.** Every route that
 * needs to know who is asking resolves the actor here, so there is exactly
 * one implementation of "who is this" and no route can accidentally
 * re-derive it differently.
 *
 * The resolution reads the database on **every** request. A stale cached
 * context after deactivation is impossible by construction (story 006's
 * edge case).
 */

import type { ActorContext } from '@/domain/accounts';

import type { SessionService } from './session-service';

/** Resolves a request's actor. */
export class ActorContextResolver {
  constructor(private readonly sessions: SessionService) {}

  /**
   * Resolve a session token into an actor context.
   *
   * Returns `null` for a missing, unknown, revoked, or expired token.
   */
  async resolve(sessionToken: string | null, now: Date = new Date()): Promise<ActorContext | null> {
    if (!sessionToken) {
      return null;
    }

    return this.sessions.resolve(sessionToken, now);
  }
}
