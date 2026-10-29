/**
 * The detail service suite — FR-13's authenticated detail view.
 *
 * **The service adds exactly one thing to bolt `006`'s projection: the
 * FR-13 gate.** Everything else — the columns, the field sets, the
 * "never loaded" mechanism — is inherited, and these tests assert that it
 * is inherited rather than re-implemented.
 */

import { describe, expect, it } from 'vitest';

import { createActorContext, type ActorContext } from '@/domain/accounts/actor-context';
import { NotFoundError } from '@/lib/errors';

import { ReportDetailService } from './report-detail-service';

import type { ReportVisibilityService } from './report-visibility-service';

/** A member. */
function aMember(id = 'member-1'): ActorContext {
  return createActorContext({
    actorId: id,
    status: 'Active',
    isAdministrator: false,
    displayName: 'A Member',
  });
}

/** A pending account. */
function aPendingAccount(id = 'pending-1'): ActorContext {
  return createActorContext({
    actorId: id,
    status: 'Pending',
    isAdministrator: false,
    displayName: 'A Pending Account',
  });
}

/** Build the service with a recording visibility service. */
function aService(): {
  readonly service: ReportDetailService;
  readonly calls: { actorId: string; reportId: string }[];
} {
  const calls: { actorId: string; reportId: string }[] = [];

  const visibility = {
    projectReport: async (actor: ActorContext | null, reportId: string) => {
      calls.push({ actorId: actor?.actorId ?? 'anonymous', reportId });

      return {
        reportId,
        viewerId: actor?.actorId ?? null,
        columns: ['unrelatedMember'] as never,
        reportFields: new Set(['summary'] as never),
        report: { id: reportId, type: 'Lost' as const, status: 'Open' },
        claims: [],
        recoveryResponses: [],
        threads: [],
        auditTrail: null,
      };
    },
  } as unknown as ReportVisibilityService;

  return { service: new ReportDetailService({ visibility }), calls };
}

describe('ReportDetailService — the gate', () => {
  it('refuses an anonymous visitor', async () => {
    // **FR-13 does not extend anonymous visibility, and FR-38 says there
    // is no anonymous report-detail page.**
    const { service } = aService();

    await expect(service.show(null, 'report-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a pending account', async () => {
    // **A pending account holds no member capability**, so it resolves to
    // the anonymous viewer.
    const { service } = aService();

    await expect(service.show(aPendingAccount(), 'report-1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('refuses before any query runs', async () => {
    // **The refusal happens before the projection is attempted**, so an
    // anonymous request cannot confirm that the report exists.
    const { service, calls } = aService();

    await expect(service.show(null, 'report-1')).rejects.toBeInstanceOf(NotFoundError);

    expect(calls).toHaveLength(0);
  });

  it('refuses with a not-found rather than a forbidden', async () => {
    // **A 403 would confirm the report exists**, and FR-38 says the
    // listing row is the whole of anonymous visibility on a report.
    const { service } = aService();

    await expect(service.show(null, 'report-1')).rejects.toThrow(/could not be found/i);
  });
});

describe('ReportDetailService — the projection', () => {
  it('delegates to the visibility service for a member', async () => {
    const { service, calls } = aService();

    await service.show(aMember('member-7'), 'report-1');

    expect(calls).toEqual([{ actorId: 'member-7', reportId: 'report-1' }]);
  });

  it('returns the projection the visibility service built', async () => {
    const { service } = aService();

    const projection = await service.show(aMember(), 'report-1');

    expect(projection.reportId).toBe('report-1');
  });

  it('passes the actor through unchanged', async () => {
    // **The projection is resolved per request** — the columns depend on
    // the viewer's relationship to the report, so the actor must reach the
    // visibility service intact.
    const { service, calls } = aService();

    await service.show(aMember('member-9'), 'report-42');

    expect(calls[0]?.actorId).toBe('member-9');
    expect(calls[0]?.reportId).toBe('report-42');
  });

  it('lets the visibility service’s own refusal through', async () => {
    // **A missing report is the visibility service's refusal**, and the
    // detail service does not swallow it.
    const visibility = {
      projectReport: async () => {
        throw new NotFoundError('That report could not be found.');
      },
    } as unknown as ReportVisibilityService;

    const refusing = new ReportDetailService({ visibility });

    await expect(refusing.show(aMember(), 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
