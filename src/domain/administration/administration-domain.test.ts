/**
 * The administrator domain's tests.
 *
 * ## What these tests are for
 *
 * The domain holds the **shape** of the administrator experience: the four
 * queues, their filters, the four tiles, the audit row's view model, and
 * FR-30's forbidden notification markers.
 *
 * The properties under test are the ones the stories make load-bearing:
 *
 * - **The tile set is a closed four.** A fifth tile has nowhere to go.
 * - **Audit is not a queue.** It is not in the tile set, not in the nav
 *   list, and there is no route to it.
 * - **The count and the queue share one filter.** So the dashboard can
 *   never disagree with the work it points at.
 * - **FR-30's markers are declared, not absent.** A marker that is not
 *   declared cannot be rendered, and the test that greps the rendered
 *   surface uses this list.
 */

import { describe, expect, it } from 'vitest';

import {
  actionVerbFor,
  actorRoleTag,
  auditRowAccessibleName,
  buildDashboardTiles,
  DASHBOARD_ALL_CAUGHT_UP,
  emptyStateNoteFor,
  hasDetailsDisclosure,
  isOperationalQueueId,
  offersLoadOlder,
  OPERATIONAL_QUEUE_FILTERS,
  OPERATIONAL_QUEUE_IDS,
  OPERATIONAL_QUEUE_LABELS,
  OPERATIONAL_QUEUE_ROUTES,
  OPERATIONAL_QUEUES,
  presentationFor,
  queueEmptyCopy,
  queueLabel,
  queueRoute,
  tileEmptyCopy,
  type DashboardCounts,
} from './index';

/** The four counts, all non-zero. */
const COUNTS: DashboardCounts = Object.freeze({
  'pending-registrations': 3,
  'pending-claims': 12,
  'awaiting-return': 0,
  verifications: 5,
});

describe('the four operational queues', () => {
  it('has exactly four members', () => {
    expect(OPERATIONAL_QUEUES).toHaveLength(4);
    expect(OPERATIONAL_QUEUE_IDS).toHaveLength(4);
  });

  it('names the four queues the story names', () => {
    expect(OPERATIONAL_QUEUES.map(queueLabel)).toEqual([
      'Pending Registrations',
      'Pending Claims',
      'Items Awaiting Return',
      'Items in Verification',
    ]);
  });

  it('routes each queue to its own page', () => {
    expect(OPERATIONAL_QUEUE_ROUTES).toEqual({
      'pending-registrations': '/admin/registrations',
      'pending-claims': '/admin/claims',
      'awaiting-return': '/admin/awaiting-return',
      verifications: '/admin/verifications',
    });
  });

  it('does not route any queue to a global audit page', () => {
    // **§17.1: there is no global `/admin/audit` route.** A queue that
    // pointed at one would be the first step to that route existing.
    for (const route of Object.values(OPERATIONAL_QUEUE_ROUTES)) {
      expect(route).not.toContain('/audit');
    }
  });

  it('gives each queue a filter that names its own side', () => {
    expect(OPERATIONAL_QUEUE_FILTERS['pending-registrations']).toEqual({
      kind: 'AccountStatus',
      status: 'Pending',
    });

    expect(OPERATIONAL_QUEUE_FILTERS['pending-claims']).toEqual({
      kind: 'ClaimStatus',
      reportType: 'Found',
      status: 'Pending',
    });

    expect(OPERATIONAL_QUEUE_FILTERS['awaiting-return']).toEqual({
      kind: 'ReportStatus',
      reportType: 'Found',
      status: 'Claim Approved',
    });

    expect(OPERATIONAL_QUEUE_FILTERS.verifications).toEqual({
      kind: 'ReportStatus',
      reportType: 'Lost',
      status: 'Verification Pending',
    });
  });

  it('keeps the Found side and the Lost side apart', () => {
    const found = OPERATIONAL_QUEUES.filter(
      (queue) => 'reportType' in OPERATIONAL_QUEUE_FILTERS[queue],
    ).map((queue) => (OPERATIONAL_QUEUE_FILTERS[queue] as { reportType: string }).reportType);

    // **FR-34/FR-35 name the Found side and FR-50 names the Lost side.**
    // A queue that lost its side would mix the two operations.
    expect(found.filter((side) => side === 'Found')).toHaveLength(2);
    expect(found.filter((side) => side === 'Lost')).toHaveLength(1);
  });

  it('gives each queue its own empty-state copy', () => {
    expect(queueEmptyCopy('pending-registrations')).toBe('No pending registrations.');
    expect(queueEmptyCopy('pending-claims')).toBe('No pending claims.');
    expect(queueEmptyCopy('awaiting-return')).toBe('No items are awaiting return.');
    expect(queueEmptyCopy('verifications')).toBe('No items are in verification.');
  });

  it('gives only the Pending Registrations queue an empty-state note', () => {
    expect(emptyStateNoteFor('pending-registrations')).toBe(
      'When someone new registers, they appear here.',
    );

    expect(emptyStateNoteFor('pending-claims')).toBeNull();
    expect(emptyStateNoteFor('awaiting-return')).toBeNull();
    expect(emptyStateNoteFor('verifications')).toBeNull();
  });

  it('gives each queue the same label the tile shows', () => {
    // **The tile's label and the queue's heading share the string,** so
    // they cannot drift.
    for (const queue of OPERATIONAL_QUEUES) {
      expect(OPERATIONAL_QUEUE_LABELS[queue]).toBe(queueLabel(queue));
      expect(queueRoute(queue)).toBe(OPERATIONAL_QUEUE_ROUTES[queue]);
    }
  });

  it('recognises its own ids and nothing else', () => {
    expect(isOperationalQueueId('pending-claims')).toBe(true);
    expect(isOperationalQueueId('audit')).toBe(false);
    expect(isOperationalQueueId('recent-activity')).toBe(false);
  });
});

describe('the dashboard tiles', () => {
  it('builds exactly four tiles, in the queue order', () => {
    const tiles = buildDashboardTiles(COUNTS);

    expect(tiles).toHaveLength(4);
    expect(tiles.map((tile) => tile.queue)).toEqual(OPERATIONAL_QUEUES);
  });

  it('carries the count and the queue’s own route', () => {
    const tiles = buildDashboardTiles(COUNTS);

    expect(tiles[0]).toEqual({
      queue: 'pending-registrations',
      label: 'Pending Registrations',
      href: '/admin/registrations',
      count: 3,
      empty: false,
    });
  });

  it('marks only the zero-count tiles as empty', () => {
    const tiles = buildDashboardTiles(COUNTS);
    const empty = tiles.filter((tile) => tile.empty);

    expect(empty).toHaveLength(1);
    expect(empty[0]?.queue).toBe('awaiting-return');
  });

  it('gives an empty tile the "All caught up." copy and a non-empty tile none', () => {
    const tiles = buildDashboardTiles(COUNTS);

    for (const tile of tiles) {
      const copy = tileEmptyCopy(tile);
      expect(copy).toBe(tile.empty ? DASHBOARD_ALL_CAUGHT_UP : null);
    }
  });

  it('never names audit', () => {
    // **Audit is contextual, not a queue** — §15.1, §17.1.
    const labels = buildDashboardTiles(COUNTS).map((tile) => tile.label);

    expect(labels.join(' ').toLowerCase()).not.toContain('audit');
  });
});

describe('the audit row’s view model', () => {
  it('gives every catalogued event type a presentation', () => {
    const types = [
      'report.created',
      'report.edited_by_reporter',
      'report.edited_by_administrator',
      'member_profile.edited',
      'registration.submitted',
      'registration.approved',
      'registration.rejected',
      'claim.submitted',
      'claim.approved',
      'claim.rejected_by_administrator',
      'claim.auto_rejected',
      'recovery_response.submitted',
      'recovery_response.selected_for_verification',
      'recovery_response.determined_match_confirmed',
      'recovery_response.determined_not_a_match',
      'recovery_response.withdrawn_by_responder',
      'thread.claim_message_posted',
      'recovery_response.thread_message_posted',
      'content.removed_by_administrator',
      'account.deactivated',
    ];

    for (const type of types) {
      const presentation = presentationFor(type);

      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.accent.length).toBeGreaterThan(0);
    }
  });

  it('marks the four non-numbered records as non-numbered', () => {
    // **§17.5a: they "do not introduce event 31 or any later event
    // number".** So they must not display a number.
    expect(presentationFor('member_profile.edited').numbered).toBe(false);
    expect(presentationFor('report.edited_by_administrator').numbered).toBe(false);
    expect(presentationFor('registration.submitted').numbered).toBe(false);
    expect(presentationFor('content.removed_by_administrator').numbered).toBe(false);
  });

  it('marks the numbered workflow events as numbered', () => {
    expect(presentationFor('report.created').numbered).toBe(true);
    expect(presentationFor('registration.approved').numbered).toBe(true);
    expect(presentationFor('claim.approved').numbered).toBe(true);
    expect(presentationFor('recovery_response.determined_match_confirmed').numbered).toBe(true);
  });

  it('refuses an event type the catalog does not name', () => {
    // **An unknown type is a defect**, not a blank row.
    expect(() => presentationFor('event.invented')).toThrow(/defect/i);
  });

  it('tells the reporter’s edit from the administrator’s edit', () => {
    // **§17.5a: distinct label, distinct actor.**
    expect(presentationFor('report.edited_by_reporter').label).toBe('Report edited by reporter');
    expect(presentationFor('report.edited_by_administrator').label).toBe(
      'Report edited by Administrator',
    );
  });

  it('derives the plain-English action verb', () => {
    expect(actionVerbFor('report.created')).toBe('created');
    expect(actionVerbFor('claim.approved')).toBe('approved');
    expect(actionVerbFor('claim.rejected_by_administrator')).toBe('rejected');
    expect(actionVerbFor('claim.auto_rejected')).toBe('auto-rejected');
    expect(actionVerbFor('registration.approved')).toBe('registered');
    expect(actionVerbFor('account.deactivated')).toBe('deactivated');
    expect(actionVerbFor('thread.claim_message_posted')).toBe('message posted');
  });

  it('builds the row’s accessible name from §20.3’s template', () => {
    const name = auditRowAccessibleName({
      eventType: 'claim.approved',
      actorDisplayName: 'Riley Chen',
      target: 'Brown leather wallet',
      timestamp: '14 Mar 2026, 09:15',
    });

    expect(name).toBe('approved Riley Chen Brown leather wallet at 14 Mar 2026, 09:15');
  });

  it('tags an administrator actor and a member actor', () => {
    expect(actorRoleTag('administrator')).toBe('Administrator');
    expect(actorRoleTag('member')).toBe('Member');
  });

  it('offers a disclosure only when the row has additional fields', () => {
    expect(hasDetailsDisclosure([])).toBe(false);
    expect(hasDetailsDisclosure(['Reason: looks like mine'])).toBe(true);
  });

  it('offers "Load older" only when there is more to load', () => {
    expect(offersLoadOlder(25, true)).toBe(true);
    expect(offersLoadOlder(25, false)).toBe(false);
    expect(offersLoadOlder(0, true)).toBe(false);
  });
});
