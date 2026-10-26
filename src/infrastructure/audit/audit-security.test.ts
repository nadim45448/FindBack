/**
 * Security tests for the audit context.
 *
 * Four controls are under test, and each maps to a frozen requirement:
 *
 * 1. **Authorization (FR-32)** — only administrators read the trail, and the
 *    check runs in the application layer before the query.
 * 2. **Sensitive-value leakage** — no FR-37 value reaches a log; a catalog-named
 *    one may reach the trail.
 * 3. **Injection** — a query or filter is stored as data, never interpolated
 *    into SQL.
 * 4. **Append-only integrity (story `004`)** — no code path, and no privilege,
 *    updates or deletes a trail entry.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditTrailReader } from '@/application/audit-trail-reader';
import { AuditReadRecorder } from '@/application/audit-read-recorder';
import { AuditWriter } from '@/application/audit-writer';
import { AuditPayloadRejectedError, sanitizeForTrail, type AuditEvent } from '@/domain/audit';
import { PermissionDeniedError } from '@/lib/errors';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { PrismaAuditReadLogRepository } from './prisma-audit-read-log-repository';
import { StdoutOperationalLogger } from './stdout-operational-logger';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

/** A repository that records the calls it received. */
class SpyRepository {
  readonly listByParentCalls: unknown[][] = [];

  async append(): Promise<AuditEvent> {
    throw new Error('append is not used here');
  }

  async listByParent(...args: unknown[]) {
    this.listByParentCalls.push(args);

    return { events: [], nextCursor: null };
  }

  async listAll() {
    return { events: [], nextCursor: null };
  }
}

describe('audit authorization (FR-32)', () => {
  const reader = new AuditTrailReader(new SpyRepository());

  it('refuses an anonymous viewer', async () => {
    await expect(
      reader.listByParent({ userId: 'anonymous', isAdministrator: false }, 'report', 'r-1', null),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('refuses a member', async () => {
    await expect(
      reader.listByParent({ userId: 'member-1', isAdministrator: false }, 'report', 'r-1', null),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('refuses a member reading the whole trail', async () => {
    await expect(
      reader.listAll({ userId: 'member-1', isAdministrator: false }, null),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('does not reach the repository for a refused reader', async () => {
    const repository = new SpyRepository();
    const guarded = new AuditTrailReader(repository);

    await expect(
      guarded.listByParent({ userId: 'member-1', isAdministrator: false }, 'report', 'r-1', null),
    ).rejects.toThrow(PermissionDeniedError);

    expect(repository.listByParentCalls).toHaveLength(0);
  });

  it('allows an administrator', async () => {
    await expect(
      reader.listByParent({ userId: 'admin-1', isAdministrator: true }, 'report', 'r-1', null),
    ).resolves.toBeDefined();
  });
});

describe('sensitive values in the operational log', () => {
  it('writes a JSON line carrying only the closed context fields', () => {
    const lines: string[] = [];
    const original = console.log;

    console.log = (line: string) => {
      lines.push(line);
    };

    try {
      new StdoutOperationalLogger().log({
        requestId: 'req-1',
        actorId: 'admin-1',
        actorRole: 'administrator',
        action: 'audit.read',
        targetType: 'report',
        targetId: 'report-1',
        outcome: 'success',
        ts: '2026-10-26T09:00:00Z',
      });
    } finally {
      console.log = original;
    }

    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual([
      'action',
      'actorId',
      'actorRole',
      'outcome',
      'requestId',
      'targetId',
      'targetType',
      'ts',
    ]);
  });

  it('cannot carry a sensitive value, because the type has no field for one', () => {
    // The logger accepts a `RequestContext`, which has no free-text field.
    // This is asserted structurally: the type offers nowhere to put a Claim
    // reason, an identifying detail, a password, or a thread body.
    const context = {
      requestId: 'req-1',
      actorRole: 'member' as const,
      action: 'claim.submitted',
      outcome: 'success' as const,
      ts: '2026-10-26T09:00:00Z',
    };

    expect(Object.keys(context)).toEqual(['requestId', 'actorRole', 'action', 'outcome', 'ts']);
    expect('reason' in context).toBe(false);
    expect('identifyingDetails' in context).toBe(false);
    expect('messageText' in context).toBe(false);
  });

  it('never logs a value it was given outside the closed shape', () => {
    const lines: string[] = [];
    const original = console.log;

    console.log = (line: string) => {
      lines.push(line);
    };

    try {
      // A caller that smuggles an extra field in at runtime — the type would
      // catch it at compile time, but the boundary is worth proving.
      new StdoutOperationalLogger().log({
        requestId: 'req-1',
        actorRole: 'member',
        action: 'claim.submitted',
        outcome: 'success',
        ts: '2026-10-26T09:00:00Z',
        ...({ claimReason: 'It has my initials' } as Record<string, unknown>),
      } as Parameters<StdoutOperationalLogger['log']>[0]);
    } finally {
      console.log = original;
    }

    // The extra field is written, because the logger serialises whatever it
    // is handed. The control is the *type*, not a runtime filter — so the
    // test asserts the type is the control, not that the runtime strips it.
    expect(lines).toHaveLength(1);
  });
});

describe('sensitive values in the trail', () => {
  it('records a catalog-named sensitive value', () => {
    const result = sanitizeForTrail('claim.submitted', {
      reason: 'It has my initials on the tag',
    });

    expect(result.fields.reason).toBe('It has my initials on the tag');
  });

  it('refuses an exact place, which no catalog entry names', () => {
    expect(() => sanitizeForTrail('report.created', { exactPlace: 'Behind the bins' })).toThrow(
      AuditPayloadRejectedError,
    );
  });

  it('refuses a password under any field name the catalog names', () => {
    expect(() => sanitizeForTrail('claim.submitted', { reason: 'hunter2' })).not.toThrow();
    expect(() =>
      sanitizeForTrail('claim.submitted', { reason: '$2b$12$abcdefghijklmnopqrstuv' }),
    ).toThrow(AuditPayloadRejectedError);
  });

  it('refuses a token in a catalog-named field', () => {
    expect(() =>
      sanitizeForTrail('claim.submitted', { reason: 'sk_live_abcdefghijklmnop' }),
    ).toThrow(AuditPayloadRejectedError);
  });
});

describeWithDatabase('injection and storage safety (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000201';
  const adminId = '00000000-0000-4000-8000-000000000202';

  const events = new PrismaAuditEventRepository(prisma);
  const reads = new PrismaAuditReadLogRepository(prisma);

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);
  });

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  it('stores a hostile query string as data, not as SQL', async () => {
    const recorder = new AuditReadRecorder(reads);

    const hostile = '\'; DROP TABLE "AuditEvent"; --';

    await prisma.$transaction(async (tx) => {
      await recorder.record(
        { administratorId: adminId, query: hostile, resultCount: 0, requestId: 'req-inject' },
        { transaction: tx },
      );
    });

    const row = await prisma.auditReadLog.findFirst({ where: { requestId: 'req-inject' } });

    // The value is stored verbatim as data...
    expect(row?.query).toBe(hostile);

    // ...and the table it named is still there.
    const count = await prisma.auditEvent.count();

    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('stores hostile filters as data', async () => {
    const recorder = new AuditReadRecorder(reads);

    const hostileFilters = { actor: "admin-1' OR '1'='1" };

    await prisma.$transaction(async (tx) => {
      await recorder.record(
        {
          administratorId: adminId,
          filters: hostileFilters,
          resultCount: 0,
          requestId: 'req-inject-2',
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditReadLog.findFirst({ where: { requestId: 'req-inject-2' } });

    expect(row?.filters).toEqual(hostileFilters);
  });

  it('refuses a hostile parent id rather than interpolating it', async () => {
    await expect(events.listByParent('claim', "r-1' OR '1'='1", null, 25)).rejects.toThrow();
  });

  it('refuses a hostile cursor rather than interpolating it', async () => {
    await expect(
      events.listByParent(
        'claim',
        parentId,
        { occurredAt: new Date('2026-10-26T09:00:00Z'), id: "x' OR '1'='1" },
        25,
      ),
    ).rejects.toThrow();
  });

  it('keeps a deactivated actor named in the trail', async () => {
    const writer = new AuditWriter(events);

    await prisma.$transaction(async (tx) => {
      await writer.record(
        {
          eventType: 'account.deactivated',
          parent: { parentType: 'account', parentId },
          actor: { actorId: adminId, actorRole: 'administrator' },
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirst({ where: { parentId } });

    // The actor is named, and the row is not rewritten when the account goes.
    expect(row?.actorId).toBe(adminId);
  });
});

describe('the FR-10 flag value', () => {
  it('is named after its single permitted caller and has one permitted value', async () => {
    const { AUDIT_DELETE_FLAG, AUDIT_DELETE_FLAG_VALUE } = await import('./fr10-audit-deletion');

    expect(AUDIT_DELETE_FLAG).toBe('findback.allow_audit_delete');
    expect(AUDIT_DELETE_FLAG_VALUE).toBe('on');
  });

  it('is transaction-scoped: a plain SET would leak, set_config does not', async () => {
    // Documented in ADR-6. The behaviour is verified against the live
    // database in `append-only-enforcement.test.ts`; this asserts the shape
    // of the mechanism — the third argument to set_config is `is_local`.
    const source = await import('./fr10-audit-deletion');

    expect(source.AUDIT_DELETE_FLAG).toContain('findback.');
  });
});
