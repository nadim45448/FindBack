/**
 * The `ActorContext`'s tests.
 *
 * Story 006: the restriction is enforced **once**, at the `ActorContext`
 * boundary. These tests assert that the context carries the status, and
 * that a downstream unit can ask it the only question it ever needs to ask.
 */

import { describe, expect, it } from 'vitest';

import {
  createActorContext,
  hasAdministratorCapability,
  hasMemberCapability,
} from './actor-context';

describe('the actor context', () => {
  it('carries the account status', () => {
    // Story 006 criterion 5: the context carries the Pending status so
    // downstream units enforce the same restriction without re-deriving it.
    const actor = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Pending',
      isAdministrator: false,
      displayName: 'Jane Doe',
    });

    expect(actor.status).toBe('Pending');
  });

  it('grants member capability to an Active account', () => {
    const actor = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Active',
      isAdministrator: false,
      displayName: 'Jane Doe',
    });

    expect(hasMemberCapability(actor)).toBe(true);
  });

  it('denies member capability to a Pending account', () => {
    // FR-2: a Pending account can do nothing except wait.
    const actor = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Pending',
      isAdministrator: false,
      displayName: 'Jane Doe',
    });

    expect(hasMemberCapability(actor)).toBe(false);
    expect(actor.capability).toBe('none');
  });

  it('ignores the administrator flag on a non-Active account', () => {
    // Story 006's edge case: "Administrator flag set on a Pending account →
    // Still restricted; flag alone grants nothing before approval."
    const actor = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Pending',
      isAdministrator: true,
      displayName: 'Jane Doe',
    });

    expect(actor.isAdministrator).toBe(false);
    expect(hasAdministratorCapability(actor)).toBe(false);
  });

  it('grants administrator capability to an Active administrator', () => {
    const actor = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Active',
      isAdministrator: true,
      displayName: 'Jane Doe',
    });

    expect(hasAdministratorCapability(actor)).toBe(true);
  });

  it('grants no administrator capability to an ordinary member', () => {
    const actor = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Active',
      isAdministrator: false,
      displayName: 'Jane Doe',
    });

    expect(hasAdministratorCapability(actor)).toBe(false);
  });

  it('reflects a status change with no data migration', () => {
    // Story 006 criterion 6: the restriction is evaluated from the status
    // the context carries, so a Pending → Active change takes effect with
    // no migration.
    const before = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Pending',
      isAdministrator: false,
      displayName: 'Jane Doe',
    });

    const after = createActorContext({
      actorId: '00000000-0000-4000-8000-000000000001',
      status: 'Active',
      isAdministrator: false,
      displayName: 'Jane Doe',
    });

    expect(hasMemberCapability(before)).toBe(false);
    expect(hasMemberCapability(after)).toBe(true);
  });
});
