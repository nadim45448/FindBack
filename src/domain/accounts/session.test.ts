/**
 * The `Session` aggregate's tests.
 *
 * The revocation semantics, the expiry enforcement, and the **hourly
 * refresh approximation** (ADR-16) are asserted here, so the approximation
 * is a tested, documented property rather than an accident.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INACTIVITY_DAYS,
  DEFAULT_REFRESH_THRESHOLD_MINUTES,
  effectiveIdleWindowDays,
  isActivityRefreshDue,
  isUsableSession,
  issueSession,
  refreshSessionActivity,
  revokeSession,
  type Session,
} from './session';

/** A session, for the tests to act on. */
function aSession(overrides: Partial<Session> = {}): Session {
  const base = issueSession({
    id: '00000000-0000-4000-8000-000000000010',
    accountId: '00000000-0000-4000-8000-000000000001',
    tokenHash: 'a'.repeat(64),
    createdAt: new Date('2026-10-27T10:00:00Z'),
  });

  return { ...base, ...overrides };
}

describe('issuing a session', () => {
  it('expires fourteen days after its creation', () => {
    // FR-4: "Sessions expire after 14 days of inactivity."
    const session = aSession();

    expect(DEFAULT_INACTIVITY_DAYS).toBe(14);
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(
      14 * 24 * 60 * 60 * 1000,
    );
  });

  it('starts un-revoked, with its activity at its creation', () => {
    const session = aSession();

    expect(session.revokedAt).toBeNull();
    expect(session.revocationReason).toBeNull();
    expect(session.lastActivityAt).toEqual(session.createdAt);
  });

  it('honours a shorter inactivity window', () => {
    const session = issueSession({
      id: '00000000-0000-4000-8000-000000000011',
      accountId: '00000000-0000-4000-8000-000000000001',
      tokenHash: 'b'.repeat(64),
      createdAt: new Date('2026-10-27T10:00:00Z'),
      inactivityDays: 1,
    });

    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('revoking a session', () => {
  it('records the revocation and its reason', () => {
    const at = new Date('2026-10-27T12:00:00Z');
    const revoked = revokeSession(aSession(), 'logout', at);

    expect(revoked.revokedAt).toEqual(at);
    expect(revoked.revocationReason).toBe('logout');
  });

  it('is idempotent — a second revocation changes nothing', () => {
    // Story 005 criterion 4: a logout without a valid session is an
    // idempotent success.
    const first = revokeSession(aSession(), 'logout', new Date('2026-10-27T12:00:00Z'));
    const second = revokeSession(first, 'logout', new Date('2026-10-27T13:00:00Z'));

    expect(second.revokedAt).toEqual(first.revokedAt);
    expect(second.revocationReason).toBe('logout');
  });
});

describe('usability', () => {
  it('is usable before its expiry', () => {
    expect(isUsableSession(aSession(), new Date('2026-10-28T10:00:00Z'))).toBe(true);
  });

  it('is not usable after its expiry', () => {
    // The expiry is enforced **on read**, so a session is dead the moment
    // its window elapses — with no cron job in the loop.
    expect(isUsableSession(aSession(), new Date('2026-11-20T10:00:00Z'))).toBe(false);
  });

  it('is not usable once revoked', () => {
    const revoked = revokeSession(aSession(), 'logout', new Date('2026-10-27T12:00:00Z'));

    expect(isUsableSession(revoked, new Date('2026-10-27T13:00:00Z'))).toBe(false);
  });
});

describe('the activity refresh', () => {
  it('is not due immediately after a session is created', () => {
    const session = aSession();

    expect(isActivityRefreshDue(session, new Date('2026-10-27T10:30:00Z'))).toBe(false);
  });

  it('is due after the threshold', () => {
    const session = aSession();

    expect(isActivityRefreshDue(session, new Date('2026-10-27T11:00:00Z'))).toBe(true);
  });

  it('moves the expiry with the activity', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    const refreshed = refreshSessionActivity(aSession(), now);

    expect(refreshed.lastActivityAt).toEqual(now);
    expect(refreshed.expiresAt.getTime() - now.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('gives an idle window of 13 to 14 days, never less', () => {
    // ADR-16: the effective idle window is 13–14 days rather than exactly
    // 14, because the activity timestamp is refreshed at most once per
    // hour. The approximation is on the safe side — a session is never
    // revoked early.
    const window = effectiveIdleWindowDays();

    expect(window.maxDays).toBe(14);
    expect(window.minDays).toBeGreaterThan(13);
    expect(window.minDays).toBeLessThan(14);
  });

  it('keeps the effective window above thirteen days for the default threshold', () => {
    const window = effectiveIdleWindowDays(14, DEFAULT_REFRESH_THRESHOLD_MINUTES);

    expect(window.minDays).toBeCloseTo(13.958, 3);
  });
});
