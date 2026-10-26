import { describe, expect, it } from 'vitest';

import { AuditCatalogViolationError } from './errors';
import { APPEND_ONLY_GUARD, buildAuditEventFields, resolveEventNumber } from './audit-event';

/**
 * The event number is derived from the catalog, never taken on trust. A
 * caller cannot invent event 31, and cannot write a numbered event under a
 * non-numbered type.
 */
describe('audit event construction', () => {
  it('derives the catalog number for a numbered type', () => {
    expect(resolveEventNumber('claim.approved')).toBe(3);
    expect(resolveEventNumber('recovery_response.completed_report_returned')).toBe(30);
  });

  it('resolves a non-numbered type to no number', () => {
    expect(resolveEventNumber('member_profile.edited')).toBeNull();
  });

  it('refuses an unknown event type', () => {
    expect(() => resolveEventNumber('claim.obliterated')).toThrow(AuditCatalogViolationError);
  });

  it('refuses a number that does not match the type', () => {
    expect(() => resolveEventNumber('claim.approved', 31)).toThrow(AuditCatalogViolationError);
    expect(() => resolveEventNumber('claim.approved', 4)).toThrow(AuditCatalogViolationError);
  });

  it('refuses a number on a non-numbered record', () => {
    expect(() => resolveEventNumber('member_profile.edited', 1)).toThrow(
      AuditCatalogViolationError,
    );
  });

  it('builds the persisted fields for an event', () => {
    const fields = buildAuditEventFields({
      eventType: 'claim.submitted',
      parent: { parentType: 'claim', parentId: 'claim-1' },
      actor: { actorId: 'user-1', actorRole: 'member' },
      payload: { reason: 'My initials are on it' },
      occurredAt: new Date('2026-10-26T09:00:00Z'),
    });

    expect(fields.eventNumber).toBe(2);
    expect(fields.eventType).toBe('claim.submitted');
    expect(fields.parentType).toBe('claim');
    expect(fields.parentId).toBe('claim-1');
    expect(fields.actorId).toBe('user-1');
    expect(fields.actorRole).toBe('member');
    expect(fields.metadata).toEqual({ reason: 'My initials are on it' });
    expect(fields.occurredAt).toEqual(new Date('2026-10-26T09:00:00Z'));
  });

  it('stores an empty payload as null rather than an empty object', () => {
    const fields = buildAuditEventFields({
      eventType: 'claim.approved',
      parent: { parentType: 'claim', parentId: 'claim-1' },
      actor: { actorId: 'admin-1', actorRole: 'administrator' },
      payload: {},
    });

    expect(fields.metadata).toBeNull();
  });

  it('carries the acting administrator and the determination pair', () => {
    const fields = buildAuditEventFields({
      eventType: 'recovery_response.determined_match_confirmed',
      parent: { parentType: 'recovery_response', parentId: 'rr-1' },
      actor: {
        actorId: 'admin-1',
        actorRole: 'administrator',
        actingAdministratorId: 'admin-1',
        determinedByUserId: 'owner-1',
        recordedByAdministratorId: 'admin-1',
      },
    });

    expect(fields.determinedByUserId).toBe('owner-1');
    expect(fields.recordedByAdministratorId).toBe('admin-1');
    expect(fields.actingAdministratorId).toBe('admin-1');
  });
});

describe('append-only guard', () => {
  it('exposes no update path and no delete path', () => {
    expect(APPEND_ONLY_GUARD.isAppendOnly).toBe(true);
    expect(APPEND_ONLY_GUARD.hasUpdatePath).toBe(false);
    expect(APPEND_ONLY_GUARD.hasDeletePath).toBe(false);
  });
});
