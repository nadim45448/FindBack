import { describe, expect, it } from 'vitest';

import { AuditTrailReader } from './audit-trail-reader';
import type { AuditEventRepository, TrailPage } from './ports/audit-event-repository';
import { PermissionDeniedError } from '@/lib/errors';

/** A repository that records the calls it received. */
class SpyRepository implements AuditEventRepository {
  readonly listByParentCalls: unknown[][] = [];
  readonly listAllCalls: unknown[][] = [];

  async append(): Promise<never> {
    throw new Error('append is not used by the reader');
  }

  async listByParent(...args: unknown[]): Promise<TrailPage> {
    this.listByParentCalls.push(args);
    return { events: [], nextCursor: null };
  }

  async listAll(...args: unknown[]): Promise<TrailPage> {
    this.listAllCalls.push(args);
    return { events: [], nextCursor: null };
  }
}

const administrator = { userId: 'admin-1', isAdministrator: true };
const member = { userId: 'user-1', isAdministrator: false };

describe('AuditTrailReader', () => {
  it('refuses a non-administrator before the repository is reached', async () => {
    const repository = new SpyRepository();
    const reader = new AuditTrailReader(repository);

    await expect(reader.listByParent(member, 'report', 'report-1', null)).rejects.toThrow(
      PermissionDeniedError,
    );
    expect(repository.listByParentCalls).toHaveLength(0);
  });

  it('refuses a non-administrator reading the whole trail', async () => {
    const repository = new SpyRepository();
    const reader = new AuditTrailReader(repository);

    await expect(reader.listAll(member, null)).rejects.toThrow(PermissionDeniedError);
    expect(repository.listAllCalls).toHaveLength(0);
  });

  it('caps the page at 25 entries', async () => {
    const repository = new SpyRepository();
    const reader = new AuditTrailReader(repository);

    await reader.listByParent(administrator, 'report', 'report-1', null, 100);

    expect(repository.listByParentCalls[0]?.[3]).toBe(25);
  });

  it('defaults to 25 entries per page', async () => {
    const repository = new SpyRepository();
    const reader = new AuditTrailReader(repository);

    await reader.listAll(administrator, null);

    expect(repository.listAllCalls[0]?.[1]).toBe(25);
  });

  it('passes the cursor through unchanged', async () => {
    const repository = new SpyRepository();
    const reader = new AuditTrailReader(repository);
    const cursor = { occurredAt: new Date('2026-10-26T09:00:00Z'), id: 'event-1' };

    await reader.listByParent(administrator, 'report', 'report-1', cursor);

    expect(repository.listByParentCalls[0]?.[2]).toBe(cursor);
  });
});
