/**
 * The administrator queries' tests.
 *
 * ## The properties under test
 *
 * - **The authorisation is upstream.** A non-administrator is refused
 *   *before* the reader is called — so no count, no row, and no signal
 *   about whether there is any work reaches them.
 * - **The count and the queue cannot disagree.** Both are read through
 *   the same filter and the same reader.
 * - **The queue returns its own rows, not the union.** A Pending Claims
 *   queue must not carry a registration's fields.
 * - **Audit has no `listAll`.** The contextual query names a parent and
 *   refuses a parent type the trail cannot be read for.
 */

import { describe, expect, it, vi } from 'vitest';

import { PermissionDeniedError, ValidationError } from '@/lib/errors';

import { OPERATIONAL_QUEUE_FILTERS, type OperationalQueueId } from '@/domain/administration';

import {
  AdministratorDashboardQuery,
  AdministratorQueueQuery,
  ContextualAuditQuery,
} from './index';
import type { QueuePage, QueueReader, QueueRow } from './ports/queue-reader';

/** A reader that records the filters it was asked for. */
function recordingReader(rows: readonly QueueRow[] = [], count = 0): {
  readonly reader: QueueReader;
  readonly filters: string[];
} {
  const filters: string[] = [];

  const reader: QueueReader = {
    read: async (filter, _limit) => {
      filters.push(JSON.stringify(filter));

      return { rows, count } satisfies QueuePage;
    },
  };

  return { reader, filters };
}

/** A row of each of the four kinds. */
const PENDING_REGISTRATION: QueueRow = {
  kind: 'PendingRegistration',
  accountId: 'aaaaaaaa-0000-0000-0000-000000000001',
  displayName: 'Riley Chen',
  email: 'riley@example.edu',
  selfDeclaredRole: 'Student',
  registeredAt: new Date('2026-03-01T09:00:00Z'),
};

const PENDING_CLAIM: QueueRow = {
  kind: 'PendingClaim',
  claimId: 'bbbbbbbb-0000-0000-0000-000000000002',
  reportId: 'cccccccc-0000-0000-0000-000000000003',
  itemName: 'Brown leather wallet',
  claimantDisplayName: 'Sam Okafor',
  submittedAt: new Date('2026-03-02T10:00:00Z'),
};

const AWAITING_RETURN: QueueRow = {
  kind: 'AwaitingReturn',
  reportId: 'dddddddd-0000-0000-0000-000000000004',
  itemName: 'Blue umbrella',
  claimantName: 'Alex Kim',
  approvedAt: new Date('2026-03-03T11:00:00Z'),
};

const VERIFICATION: QueueRow = {
  kind: 'Verification',
  reportId: 'eeeeeeee-0000-0000-0000-000000000005',
  reportName: 'Lost keys',
  ownerDisplayName: 'Jo Patel',
  ownerUserId: 'aaaaaaaa-0000-0000-0000-00000000000a',
  selectedResponderDisplayName: 'Nia Lopez',
  verificationStartedAt: new Date('2026-03-04T12:00:00Z'),
};

/** The administrator viewer. */
const ADMIN = { userId: 'ffffffff-0000-0000-0000-00000000000f', isAdministrator: true };

/** The member viewer. */
const MEMBER = { userId: 'ffffffff-0000-0000-0000-00000000000e', isAdministrator: false };

describe('the administrator dashboard query', () => {
  it('reads all four queues', async () => {
    const { reader, filters } = recordingReader([], 0);

    await new AdministratorDashboardQuery(reader).read(ADMIN);

    expect(filters).toHaveLength(4);
  });

  it('reads each queue with that queue’s own filter', async () => {
    const { reader, filters } = recordingReader([], 0);

    await new AdministratorDashboardQuery(reader).read(ADMIN);

    // **The count and the rows are drawn from the same filter,** so the
    // dashboard can never disagree with the work it points at.
    expect(filters).toEqual([
      JSON.stringify(OPERATIONAL_QUEUE_FILTERS['pending-registrations']),
      JSON.stringify(OPERATIONAL_QUEUE_FILTERS['pending-claims']),
      JSON.stringify(OPERATIONAL_QUEUE_FILTERS['awaiting-return']),
      JSON.stringify(OPERATIONAL_QUEUE_FILTERS.verifications),
    ]);
  });

  it('returns the four counts', async () => {
    const { reader } = recordingReader([], 7);

    const dashboard = await new AdministratorDashboardQuery(reader).read(ADMIN);

    expect(dashboard.counts).toEqual({
      'pending-registrations': 7,
      'pending-claims': 7,
      'awaiting-return': 7,
      verifications: 7,
    });
  });

  it('carries no activity, digest, or recent field', async () => {
    const { reader } = recordingReader([], 1);

    const dashboard = await new AdministratorDashboardQuery(reader).read(ADMIN);

    // **§15.1: the dashboard is four tiles and nothing else.** A future
    // implementer looking for a place to put an activity feed would not
    // find one.
    expect(Object.keys(dashboard)).toEqual(['counts']);
    expect(Object.keys(dashboard.counts)).toHaveLength(4);
  });

  it('refuses a non-administrator before the reader runs', async () => {
    const reader: QueueReader = {
      read: vi.fn(async () => ({ rows: [], count: 0 })),
    };

    await expect(new AdministratorDashboardQuery(reader).read(MEMBER)).rejects.toThrow(
      PermissionDeniedError,
    );

    // **The refusal is upstream of the query,** so no count leaks.
    expect(reader.read).not.toHaveBeenCalled();
  });
});

describe('the administrator queue query', () => {
  it('refuses a non-administrator before the reader runs', async () => {
    const reader: QueueReader = {
      read: vi.fn(async () => ({ rows: [], count: 0 })),
    };

    await expect(
      new AdministratorQueueQuery(reader).read(MEMBER, 'pending-claims'),
    ).rejects.toThrow(PermissionDeniedError);

    expect(reader.read).not.toHaveBeenCalled();
  });

  it('reads a queue with that queue’s own filter', async () => {
    const { reader, filters } = recordingReader([]);

    await new AdministratorQueueQuery(reader).read(ADMIN, 'verifications');

    expect(filters).toEqual([JSON.stringify(OPERATIONAL_QUEUE_FILTERS.verifications)]);
  });

  it('returns only the rows of the queue it was asked for', async () => {
    // **A reader that returns every kind is a reader that is not filtering.**
    const { reader } = recordingReader([
      PENDING_REGISTRATION,
      PENDING_CLAIM,
      AWAITING_RETURN,
      VERIFICATION,
    ]);

    const queue = await new AdministratorQueueQuery(reader).read(ADMIN, 'pending-claims');

    expect(queue.queue).toBe('pending-claims');
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0]).toMatchObject({ claimId: PENDING_CLAIM.claimId });
  });

  it('gives each queue its own row shape', async () => {
    const { reader } = recordingReader([PENDING_REGISTRATION]);

    const queue = await new AdministratorQueueQuery(reader).read(ADMIN, 'pending-registrations');

    expect(queue.queue).toBe('pending-registrations');
    expect(queue.rows[0]).toEqual({
      accountId: PENDING_REGISTRATION.accountId,
      displayName: PENDING_REGISTRATION.displayName,
      email: PENDING_REGISTRATION.email,
      selfDeclaredRole: PENDING_REGISTRATION.selfDeclaredRole,
      registeredAt: PENDING_REGISTRATION.registeredAt,
    });
  });

  it('reports the count it read', async () => {
    const { reader } = recordingReader([], 12);

    const queue = await new AdministratorQueueQuery(reader).read(ADMIN, 'awaiting-return');

    expect(queue.count).toBe(12);
  });

  it('reads every queue id without error', async () => {
    const { reader } = recordingReader([]);

    const query = new AdministratorQueueQuery(reader);

    for (const queue of [
      'pending-registrations',
      'pending-claims',
      'awaiting-return',
      'verifications',
    ] as readonly OperationalQueueId[]) {
      const result = await query.read(ADMIN, queue);

      expect(result.queue).toBe(queue);
    }
  });
});

describe('the contextual audit query', () => {
  /** A stand-in for Unit 006's trail service. */
  function trailStub(): {
    readonly trail: {
      listByParent: (
        viewer: unknown,
        parentType: string,
        parentId: string,
        query: unknown,
        context: unknown,
      ) => Promise<{ events: never[]; nextCursor: null }>;
    };
    readonly calls: { parentType: string; parentId: string }[];
  } {
    const calls: { parentType: string; parentId: string }[] = [];

    return {
      calls,
      trail: {
        listByParent: async (
          _viewer: unknown,
          parentType: string,
          parentId: string,
          _query: unknown,
          _context: unknown,
        ) => {
          calls.push({ parentType, parentId });

          return { events: [], nextCursor: null };
        },
      },
    };
  }

  it('refuses a non-administrator before the trail is read', async () => {
    const { trail, calls } = trailStub();

    await expect(
      new ContextualAuditQuery(trail as never).read(
        MEMBER,
        'report',
        'cccccccc-0000-0000-0000-000000000003',
        null,
        { requestId: 'req-1' },
      ),
    ).rejects.toThrow(PermissionDeniedError);

    expect(calls).toHaveLength(0);
  });

  it('refuses a parent type the trail cannot be read for', async () => {
    const { trail, calls } = trailStub();

    await expect(
      new ContextualAuditQuery(trail as never).read(
        ADMIN,
        'not_a_parent_type',
        'cccccccc-0000-0000-0000-000000000003',
        null,
        { requestId: 'req-1' },
      ),
    ).rejects.toThrow(ValidationError);

    expect(calls).toHaveLength(0);
  });

  it('reads the named parent’s trail', async () => {
    const { trail, calls } = trailStub();

    await new ContextualAuditQuery(trail as never).read(
      ADMIN,
      'report',
      'cccccccc-0000-0000-0000-000000000003',
      null,
      { requestId: 'req-1' },
    );

    expect(calls).toEqual([
      { parentType: 'report', parentId: 'cccccccc-0000-0000-0000-000000000003' },
    ]);
  });

  it('has no global read', () => {
    const query = new ContextualAuditQuery(trailStub().trail as never);

    // **§17.1: audit is contextual.** A `listAll` here would be a global
    // audit read with a surface-shaped name.
    expect((query as unknown as Record<string, unknown>).listAll).toBeUndefined();
    expect((query as unknown as Record<string, unknown>).readAll).toBeUndefined();
  });
});
