/**
 * FR-30's absence, made checkable — the domain suite.
 *
 * ## What these tests are for
 *
 * FR-30 is a **negative** requirement, so it cannot be satisfied by a
 * feature and it cannot be verified by a positive test. What it *can* be
 * verified by is a **closed declaration**: the product's channels are
 * enumerated, the strings that would betray a notification surface are
 * named, and the confirmations the product may raise are restricted to one
 * scope.
 *
 * The properties under test are the ones the stories make load-bearing:
 *
 * - **The channel list is a closed nine, and every one is an email.**
 * - **The forbidden markers are declared, not absent.** A marker that is
 *   not declared cannot be rendered, and the test that greps the rendered
 *   surface uses this list.
 * - **A background-event confirmation cannot be written.** The permitted
 *   scope is `OwnAction`, and the type says so.
 * - **The member's status history is at most three entries, and it carries
 *   no audit verb** — a member sees a short status list, not the trail.
 */

import { describe, expect, it } from 'vitest';

import {
  FR46_BUSINESS_EVENT_CHANNELS,
  MEMBER_STATUS_HISTORY_LIMIT,
  NOTIFICATION_SURFACE_MARKERS,
  PERMITTED_CONFIRMATION_SCOPE,
  REMOVED_AGGREGATION_MARKERS,
  SUPPORTED_NOTIFICATION_CHANNELS,
  memberStatusHistory,
  type MemberStatusHistoryEntry,
} from './index';

describe('the product’s notification channels', () => {
  it('is exactly nine', () => {
    expect(SUPPORTED_NOTIFICATION_CHANNELS).toHaveLength(9);
  });

  it('is every channel an email', () => {
    // **FR-30 forbids an in-app channel.** A channel that did not start
    // with `email:` would be an in-product stream, and the product has
    // none.
    for (const channel of SUPPORTED_NOTIFICATION_CHANNELS) {
      expect(channel.startsWith('email:')).toBe(true);
    }
  });

  it('holds exactly eight FR-46 business events', () => {
    // **The PRD's catalogue is closed at eight.** The FR-51
    // authentication email is *not* a ninth FR-46 event — it is an
    // authentication message — and the distinction is load-bearing,
    // because "FR-46 has nine events" would be a false statement about a
    // frozen PRD.
    expect(FR46_BUSINESS_EVENT_CHANNELS).toHaveLength(8);
  });

  it('holds the FR-51 authentication email outside the business catalogue', () => {
    expect(SUPPORTED_NOTIFICATION_CHANNELS).toContain('email:fr51.password_reset');
    expect(FR46_BUSINESS_EVENT_CHANNELS).not.toContain('email:fr51.password_reset');
  });

  it('declares no channel twice', () => {
    expect(new Set(SUPPORTED_NOTIFICATION_CHANNELS).size).toBe(
      SUPPORTED_NOTIFICATION_CHANNELS.length,
    );
  });
});

describe('the forbidden notification markers', () => {
  it('names a bell, a badge, a centre, a drawer, and an inbox', () => {
    // **The check is a string search, so the list must be the strings a
    // developer would actually write.**
    const markers = NOTIFICATION_SURFACE_MARKERS.join(' ').toLowerCase();

    expect(markers).toContain('notification-bell');
    expect(markers).toContain('notification-badge');
    expect(markers).toContain('notification-centre');
    expect(markers).toContain('notification-drawer');
    expect(markers).toContain('notification-inbox');
    expect(markers).toContain('unread');
  });

  it('names the unread attributes as well as the unread words', () => {
    const markers = NOTIFICATION_SURFACE_MARKERS.join(' ').toLowerCase();

    expect(markers).toContain('data-notification');
    expect(markers).toContain('data-unread');
  });

  it('declares no marker twice', () => {
    const lowered = NOTIFICATION_SURFACE_MARKERS.map((marker) => marker.toLowerCase());

    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it('names the removed aggregation separately', () => {
    // **The `Recent activity` aggregation was removed in the
    // 2026-09-17 reconciliation.** Its return is a regression against a
    // frozen contract, so it is checked like any other forbidden marker.
    expect(REMOVED_AGGREGATION_MARKERS).toContain('Recent activity');
    expect(REMOVED_AGGREGATION_MARKERS).toContain('recent-activity');
    expect(REMOVED_AGGREGATION_MARKERS).toContain('activity-feed');
  });

  it('keeps every removed-aggregation marker inside the wider forbidden set', () => {
    // **The narrower list is a subset, not a rival.** A surface that
    // renders `Recent activity` is caught by the wider scan too, so the
    // two scans cannot disagree about what is forbidden.
    for (const marker of REMOVED_AGGREGATION_MARKERS) {
      expect(NOTIFICATION_SURFACE_MARKERS).toContain(marker);
    }
  });
});

describe('the permitted confirmation scope', () => {
  it('is the user’s own action', () => {
    // **§5.9 and §9.4: a toast is for the action the user just took.**
    expect(PERMITTED_CONFIRMATION_SCOPE).toBe('OwnAction');
  });

  it('is not the background event', () => {
    // **A background event — a Claim approved, a report returned, a new
    // Pending Claim arriving — is never announced.** The permitted scope
    // is `OwnAction`, so a `BackgroundEvent` confirmation has nowhere to
    // be declared.
    expect(PERMITTED_CONFIRMATION_SCOPE).not.toBe('BackgroundEvent');
  });
});

describe('the member-facing status history', () => {
  /** A status history entry. */
  const ENTRY: MemberStatusHistoryEntry = Object.freeze({
    timestamp: new Date('2026-03-14T09:15:00Z'),
    statusLabel: 'Claim Approved',
    actorDisplayName: 'Riley Chen',
  });

  it('is capped at three entries', () => {
    expect(MEMBER_STATUS_HISTORY_LIMIT).toBe(3);
  });

  it('keeps only the most recent three', () => {
    const entries: readonly MemberStatusHistoryEntry[] = [
      { ...ENTRY, statusLabel: 'Returned' },
      { ...ENTRY, statusLabel: 'Claim Approved' },
      { ...ENTRY, statusLabel: 'Claim Requested' },
      { ...ENTRY, statusLabel: 'Open' },
    ];

    // **§17.5: at most three entries, most recent first.** The list
    // arrives newest-first, and the cap is applied to its head — so the
    // three most recent survive and the oldest falls away.
    expect(memberStatusHistory(entries).map((entry) => entry.statusLabel)).toEqual([
      'Returned',
      'Claim Approved',
      'Claim Requested',
    ]);
  });

  it('keeps fewer than three unchanged', () => {
    const entries: readonly MemberStatusHistoryEntry[] = [{ ...ENTRY, statusLabel: 'Open' }];

    expect(memberStatusHistory(entries)).toHaveLength(1);
  });

  it('carries no audit verb', () => {
    // **The absence of a `verb` field is the structural statement that a
    // member does not see the trail.** The entry carries a timestamp, a
    // status label, and an actor — and nothing that describes an action
    // the way an audit row does.
    const entry = memberStatusHistory([ENTRY])[0];

    expect(entry).not.toBeUndefined();
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'actorDisplayName',
      'statusLabel',
      'timestamp',
    ]);
  });
});
