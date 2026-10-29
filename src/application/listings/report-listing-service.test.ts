/**
 * The listing service suite — FR-14's search pool and FR-49's partitions.
 *
 * **The sequence is what the tests assert.** The partition is resolved
 * before the filter is applied, the status view is resolved before the
 * query, and the type/status combination is validated *before* any query
 * runs — so a caller who asked for an impossible combination is told so
 * rather than shown an empty page.
 */

import { describe, expect, it } from 'vitest';

import { createActorContext, type ActorContext } from '@/domain/accounts/actor-context';
import {
  administratorStatusView,
  defaultStatusView,
  emptyFilter,
  listingPage,
  type ReportListingFilter,
  type ReportListingRow,
  type ReportPartition,
} from '@/domain/listings';
import { ValidationError } from '@/lib/errors';

import { ReportListingService } from './report-listing-service';

import type { ReportListingReader } from './ports/report-listing-reader';

/** What the reader was asked for. */
interface Call {
  readonly kind: 'reports' | 'claims' | 'recoveryResponses';
  readonly partition?: ReportPartition;
  readonly filter: ReportListingFilter;
  readonly statuses: readonly string[];
  readonly viewerId: string | null;
}

/** An active member. */
function aMember(id = 'member-1'): ActorContext {
  return createActorContext({
    actorId: id,
    status: 'Active',
    isAdministrator: false,
    displayName: 'A Member',
  });
}

/** An active administrator. */
function anAdministrator(id = 'admin-1'): ActorContext {
  return createActorContext({
    actorId: id,
    status: 'Active',
    isAdministrator: true,
    displayName: 'The Administrator',
  });
}

/** A pending account — no member capability. */
function aPendingAccount(id = 'pending-1'): ActorContext {
  return createActorContext({
    actorId: id,
    status: 'Pending',
    isAdministrator: false,
    displayName: 'A Pending Account',
  });
}

/** Build the service with a recording reader. */
function aService(): {
  readonly service: ReportListingService;
  readonly calls: Call[];
} {
  const calls: Call[] = [];

  const row: ReportListingRow = {
    id: 'report-1',
    type: 'Lost',
    status: 'Open',
    name: 'A wallet',
    category: 'Wallet',
    date: '2026-10-01',
    campusArea: 'library',
  };

  const reader: ReportListingReader = {
    listReports: async (
      partition: ReportPartition,
      filter: ReportListingFilter,
      statuses: readonly string[],
      viewerId: string | null,
    ) => {
      calls.push({ kind: 'reports', partition, filter, statuses, viewerId });

      return listingPage([row], 1, 1, 25);
    },
    listClaims: async (
      viewerId: string,
      filter: ReportListingFilter,
      statuses: readonly string[],
    ) => {
      calls.push({ kind: 'claims', filter, statuses, viewerId });

      return listingPage([], 0, 1, 25);
    },
    listRecoveryResponses: async (
      viewerId: string,
      filter: ReportListingFilter,
      statuses: readonly string[],
    ) => {
      calls.push({ kind: 'recoveryResponses', filter, statuses, viewerId });

      return listingPage([], 0, 1, 25);
    },
  };

  return { service: new ReportListingService({ listings: reader }), calls };
}

describe('ReportListingService — the partition', () => {
  it('gives an anonymous visitor the public listing', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: null,
      partition: null,
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.partition).toBe('public');
  });

  it('gives an anonymous visitor the public listing even when they name a member partition', async () => {
    // **The story says so:** "an anonymous request supplying an
    // authenticated-only partition" is "not served as an authenticated
    // partition; the public listing applies".
    const { service, calls } = aService();

    await service.list({
      actor: null,
      partition: 'mine',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.partition).toBe('public');
    expect(calls[0]?.viewerId).toBeNull();
  });

  it('gives a member the browse partition when none is named', async () => {
    // **The default is `browse`, not `mine`** — so self-exposure does not
    // occur by accident.
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: null,
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.partition).toBe('browse');
  });

  it('gives a member the partition they named', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: 'mine',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.partition).toBe('mine');
  });

  it('serves the public listing when a member names it', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: 'public',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.partition).toBe('public');
  });

  it('treats a pending account as anonymous', async () => {
    // **The `Pending` restriction is enforced at the `ActorContext`
    // boundary** — a pending account holds no member capability, so it
    // resolves to the anonymous viewer.
    const { service, calls } = aService();

    await service.list({
      actor: aPendingAccount(),
      partition: 'mine',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.partition).toBe('public');
  });

  it('passes the member’s own id to the reader, so browse can exclude it', async () => {
    // **The exclusion is in the query, not applied afterwards.** The
    // reader receives the id as part of the partition's definition.
    const { service, calls } = aService();

    await service.list({
      actor: aMember('member-7'),
      partition: 'browse',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.viewerId).toBe('member-7');
  });
});

describe('ReportListingService — the participation partitions', () => {
  it('reads the claims partition as claims', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: 'claims',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.kind).toBe('claims');
  });

  it('reads the recovery_responses partition as recovery responses', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: 'recovery_responses',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.kind).toBe('recoveryResponses');
  });

  it('refuses the participation partitions to an anonymous visitor', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: null,
      partition: 'claims',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    // **The anonymous visitor got the public listing**, not an empty
    // claims list.
    expect(calls[0]?.kind).toBe('reports');
    expect(calls[0]?.partition).toBe('public');
  });
});

describe('ReportListingService — the status view', () => {
  it('excludes the terminal statuses for a member in browse', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: 'browse',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.statuses).toEqual(defaultStatusView());
    expect(calls[0]?.statuses).not.toContain('Returned');
    expect(calls[0]?.statuses).not.toContain('Closed');
  });

  it('includes the terminal statuses for an administrator', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: anAdministrator(),
      partition: 'browse',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.statuses).toEqual(administratorStatusView());
  });

  it('keeps the terminal statuses in the mine partition', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: 'mine',
      filter: emptyFilter(),
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.statuses).toContain('Returned');
    expect(calls[0]?.statuses).toContain('Closed');
  });

  it('uses an explicit status filter exactly', async () => {
    const { service, calls } = aService();

    await service.list({
      actor: aMember(),
      partition: 'browse',
      filter: { ...emptyFilter(), statuses: ['Open'] },
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.statuses).toEqual(['Open']);
  });
});

describe('ReportListingService — the validation', () => {
  it('refuses a status that cannot occur on the selected type', async () => {
    const { service } = aService();

    await expect(
      service.list({
        actor: aMember(),
        partition: 'browse',
        filter: { ...emptyFilter(), type: 'Found', statuses: ['Verification Pending'] },
        page: { number: 1, size: 25 },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses the combination before any query runs', async () => {
    // **The check is upstream of the reader.** A refused combination must
    // not have reached the database.
    const { service, calls } = aService();

    await expect(
      service.list({
        actor: aMember(),
        partition: 'browse',
        filter: { ...emptyFilter(), type: 'Found', statuses: ['Verification Pending'] },
        page: { number: 1, size: 25 },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(calls).toHaveLength(0);
  });

  it('accepts a combination that can occur', async () => {
    const { service } = aService();

    await expect(
      service.list({
        actor: aMember(),
        partition: 'browse',
        filter: { ...emptyFilter(), type: 'Found', statuses: ['Claim Requested'] },
        page: { number: 1, size: 25 },
      }),
    ).resolves.toBeDefined();
  });
});

describe('ReportListingService — the filter', () => {
  it('passes the resolved filter to the reader unchanged', async () => {
    const { service, calls } = aService();
    const filter: ReportListingFilter = {
      keyword: 'wallet',
      category: 'Wallet',
      campusArea: 'library',
      dateRange: { from: '2026-01-01', to: '2026-10-01' },
      type: 'Lost',
      statuses: null,
    };

    await service.list({
      actor: aMember(),
      partition: 'browse',
      filter,
      page: { number: 1, size: 25 },
    });

    expect(calls[0]?.filter).toBe(filter);
  });
});
