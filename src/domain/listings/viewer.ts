/**
 * The viewer — the actor, as the visibility projection sees them.
 *
 * **A `Viewer` is built from the `ActorContext`**, never from request data.
 * The projection never re-reads an account and never re-derives a status;
 * it asks the context what the actor may do (bolt `004`'s `ActorContext`
 * contract: "A downstream unit asks the context what the actor may do; it
 * does not re-read the account and it does not write its own
 * `if (status !== 'Active')` guard").
 *
 * **A non-member actor is `kind: 'anonymous'`.** This is the decision bolt
 * `004`'s Open item 1 forces on us, and it is settled here rather than
 * deferred. The `ActorContext` resolves `Pending`, `Rejected`, and
 * `Deactivated` to `capability: 'none'`, so such an account holds no member
 * capability — and FR-2 says a `Pending` member may not participate in
 * FindBack at all. There is nothing for them to have a column in, so they
 * are projected as an anonymous visitor: the FR-38 summary set, no detail
 * page.
 *
 * This is **not** a weakening of the matrix. A `Pending` viewer is not "a
 * member with reduced rights"; they are a viewer with no member rights at
 * all, and the anonymous column is what the matrix grants them.
 *
 * Pure — no I/O, no framework imports.
 */

import { hasMemberCapability, type ActorContext } from '@/domain/accounts/actor-context';

/** The kinds of viewer the projection distinguishes. */
export type ViewerKind = 'anonymous' | 'member';

/** The actor, as the visibility projection sees them. */
export interface Viewer {
  readonly kind: ViewerKind;
  /** The account id. Null for an anonymous viewer. */
  readonly accountId: string | null;
  /**
   * The administrator flag.
   *
   * Honoured **only** on an `Active` account — the `ActorContext` already
   * folds that rule in (`createActorContext` sets the flag to `false` on a
   * non-Active account), so this reads it as given and does not re-check the
   * status.
   */
  readonly isAdministrator: boolean;
  /** The viewer's own display name, for authorship display. */
  readonly displayName: string | null;
}

/** An anonymous viewer. */
export function anonymousViewer(): Viewer {
  return {
    kind: 'anonymous',
    accountId: null,
    isAdministrator: false,
    displayName: null,
  };
}

/**
 * Build a viewer from an actor context.
 *
 * The context's capability is the only input that decides the kind — the
 * status is never re-read, and a `Pending` account is not special-cased
 * here because the context has already expressed it as "no member
 * capability".
 */
export function viewerFromActorContext(actor: ActorContext | null): Viewer {
  if (!actor || !hasMemberCapability(actor)) {
    return anonymousViewer();
  }

  return {
    kind: 'member',
    accountId: actor.actorId,
    isAdministrator: actor.isAdministrator,
    displayName: actor.displayName,
  };
}

/** True when the viewer is a member with member capability. */
export function isMemberViewer(viewer: Viewer): boolean {
  return viewer.kind === 'member';
}

/** True when the viewer is an administrator. */
export function isAdministratorViewer(viewer: Viewer): boolean {
  return viewer.kind === 'member' && viewer.isAdministrator;
}
