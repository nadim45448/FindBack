/**
 * The report visibility service — the use case, tested against port fakes.
 *
 * **The fakes record what they were asked for.** That is the point of the
 * "columns-not-viewer" port contract: the reader receives the resolved
 * column set, never the viewer. A fake that recorded the *viewer* and
 * re-derived the columns would be re-implementing the rule it is supposed
 * to consume — so the fake records the columns it was handed, and the test
 * asserts on them.
 *
 * **The "participation grants nothing" regression.** FR-39 requires that
 * submitting a Claim or a Recovery Response never unlocks a field the
 * matrix does not grant that column. The service test asserts it from both
 * sides: the participant's projection carries no Sensitive Field, and the
 * reader was handed a column set that grants none.
 */

import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@/lib/errors';
import type { ActorContext } from '@/domain/accounts/actor-context';
import {
  createReportRelationship,
  type ClaimRow,
  type ProjectionColumn,
  type RecoveryResponseRow,
  type ReportRelationship,
  type ReportRow,
  type ThreadMessageRow,
} from '@/domain/listings';
import { ReportVisibilityService } from './report-visibility-service';
import type {
  AuditTrailVisibilityReader,
  ClaimVisibilityReader,
  RecoveryResponseVisibilityReader,
  ReportVisibilityReader,
  ThreadVisibilityReader,
  TrailEvent,
} from './ports';

/** A member actor. */
function actor(
  accountId: string,
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    actorId: accountId,
    status: 'Active',
    isAdministrator: false,
    displayName: `Member ${accountId}`,
    capability: 'member',
    ...overrides,
  };
}

/**
 * A relationship, with the facts the resolver reads.
 *
 * **`isReporter` is derived, never supplied.** `createReportRelationship`
 * computes it from `viewerId === reporterId` — the roles are derived from
 * the data, never asserted by the caller (PRD §3). So the fixture sets the
 * **ids**, and the relationship facts follow.
 */
function relationship(
  overrides: Partial<ReportRelationship> = {},
): ReportRelationship {
  return createReportRelationship({
    reportId: 'report-1',
    reportType: 'Found',
    reporterId: 'owner-1',
    viewerId: 'viewer-1',
    claimId: null,
    recoveryResponseId: null,
    ...overrides,
  });
}

/**
 * A relationship in which the viewer **is** the reporter.
 *
 * The `viewerId` is set to the reporter's id, which is what makes
 * `isReporter` true. Passing `isReporter: true` would do nothing — the
 * relationship derives it.
 */
function ownedRelationship(
  reportType: 'Lost' | 'Found' = 'Found',
  overrides: Partial<ReportRelationship> = {},
): ReportRelationship {
  return createReportRelationship({
    reportId: 'report-1',
    reportType,
    reporterId: 'owner-1',
    viewerId: 'owner-1',
    claimId: null,
    recoveryResponseId: null,
    ...overrides,
  });
}

/** The report row the fake reader returns. */
const REPORT_ROW: ReportRow = {
  id: 'report-1',
  type: 'Found',
  status: 'Open',
  name: 'Blue backpack',
  category: 'Accessories',
  date: '2026-10-01T00:00:00.000Z',
  campusArea: 'North Campus',
  description: 'A navy blue backpack.',
  imageRef: 'image-1',
  reporterDisplayName: 'Owner One',
  exactPlace: 'Behind the library',
  identifyingDetails: 'Red tag',
  reporterEmail: 'owner@example.test',
  reporterPhone: '+1 555 0100',
  lastActionAt: '2026-10-02T00:00:00.000Z',
};

/** The Claim rows the fake reader returns. */
const CLAIM_ROWS: readonly ClaimRow[] = [
  {
    id: 'claim-1',
    reportId: 'report-1',
    claimantId: 'viewer-1',
    status: 'Pending',
    submittedAt: '2026-10-03T00:00:00.000Z',
    reason: 'It is mine',
    identifyingDetails: 'Red tag',
    dateLost: '2026-09-28T00:00:00.000Z',
  },
  {
    id: 'claim-2',
    reportId: 'report-1',
    claimantId: 'other-claimant',
    status: 'Pending',
    submittedAt: '2026-10-04T00:00:00.000Z',
  },
];

/** The Recovery Response rows the fake reader returns. */
const RESPONSE_ROWS: readonly RecoveryResponseRow[] = [
  {
    id: 'response-1',
    reportId: 'report-1',
    responderId: 'viewer-1',
    status: 'Submitted',
    submittedAt: '2026-10-03T00:00:00.000Z',
    whereFoundExactPlace: 'By the fountain',
    observedIdentifyingDetails: 'Scuffed strap',
    dateFound: '2026-10-02T00:00:00.000Z',
    candidateImageRef: 'image-2',
  },
];

/** The thread rows the fake reader returns. */
const THREAD_ROWS: readonly ThreadMessageRow[] = [
  {
    id: 'message-1',
    parentType: 'claim',
    parentId: 'claim-1',
    authorDisplayName: 'Member viewer-1',
    body: 'This is mine.',
    postedAt: '2026-10-03T01:00:00.000Z',
  },
];

/** A fake report reader that records the columns it was handed. */
class FakeReportReader implements ReportVisibilityReader {
  readonly reportColumns: (readonly ProjectionColumn[])[] = [];

  constructor(
    private readonly relation: ReportRelationship | null = relationship(),
    private readonly row: ReportRow | null = REPORT_ROW,
  ) {}

  async loadRelationship(): Promise<ReportRelationship | null> {
    return this.relation;
  }

  async loadReportForViewer(
    _reportId: string,
    columns: readonly ProjectionColumn[],
  ): Promise<ReportRow | null> {
    this.reportColumns.push(columns);
    return this.row;
  }
}

/** A fake Claim reader that records its scope and columns. */
class FakeClaimReader implements ClaimVisibilityReader {
  readonly scopes: (readonly string[] | null)[] = [];
  readonly columns: (readonly ProjectionColumn[])[] = [];

  constructor(private readonly rows: readonly ClaimRow[] = CLAIM_ROWS) {}

  async loadClaimsForViewer(
    _reportId: string,
    columns: readonly ProjectionColumn[],
    visibleClaimIds: readonly string[] | null,
  ): Promise<readonly ClaimRow[]> {
    this.columns.push(columns);
    this.scopes.push(visibleClaimIds);

    if (visibleClaimIds === null) {
      return this.rows;
    }

    return this.rows.filter((row) => visibleClaimIds.includes(row.id));
  }
}

/** A fake Recovery Response reader that records its scope and columns. */
class FakeResponseReader implements RecoveryResponseVisibilityReader {
  readonly scopes: (readonly string[] | null)[] = [];
  readonly columns: (readonly ProjectionColumn[])[] = [];

  constructor(private readonly rows: readonly RecoveryResponseRow[] = RESPONSE_ROWS) {}

  async loadResponsesForViewer(
    _reportId: string,
    columns: readonly ProjectionColumn[],
    visibleResponseIds: readonly string[] | null,
  ): Promise<readonly RecoveryResponseRow[]> {
    this.columns.push(columns);
    this.scopes.push(visibleResponseIds);

    if (visibleResponseIds === null) {
      return this.rows;
    }

    return this.rows.filter((row) => visibleResponseIds.includes(row.id));
  }
}

/** A fake thread reader that records its parent scope. */
class FakeThreadReader implements ThreadVisibilityReader {
  readonly scopes: { claimIds: readonly string[]; responseIds: readonly string[] }[] = [];

  constructor(private readonly rows: readonly ThreadMessageRow[] = THREAD_ROWS) {}

  async loadThreadsForViewer(
    claimIds: readonly string[],
    responseIds: readonly string[],
  ): Promise<readonly ThreadMessageRow[]> {
    this.scopes.push({ claimIds, responseIds });

    return this.rows.filter(
      (row) =>
        (row.parentType === 'claim' && claimIds.includes(row.parentId)) ||
        (row.parentType === 'recovery_response' && responseIds.includes(row.parentId)),
    );
  }
}

/** A fake trail reader that records whether it was called at all. */
class FakeTrailReader implements AuditTrailVisibilityReader {
  called = false;

  async loadTrailForViewer(): Promise<readonly TrailEvent[] | null> {
    this.called = true;

    // **The whole event, not a fragment.** `TrailEvent` was `unknown`
    // until this bolt's integration test read a real event out of the
    // database. `unknown` constrained nothing, so it could not have
    // caught a field the reader failed to populate — and the reader did
    // fail, silently, until the aliasing fix.
    return [
      {
        id: 'event-1',
        eventNumber: 1,
        eventType: 'report.created',
        parentType: 'report',
        parentId: 'report-1',
        actorId: 'actor-1',
        actorRole: 'member',
        reason: null,
        previousValues: null,
        changedFields: null,
        metadata: null,
        occurredAt: '2026-10-28T12:00:00.000Z',
        createdAt: '2026-10-28T12:00:00.000Z',
      },
    ];
  }
}

/**
 * The message of the error a call rejects with.
 *
 * The call is expected to reject, so the rejection is the **result** being
 * inspected — not an unhandled failure.
 */
async function rejectionMessage(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('The call was expected to reject, but it resolved.');
}

/** The service under test, with every fake wired in. */
function buildService(
  overrides: {
    reports?: FakeReportReader;
    claims?: FakeClaimReader;
    responses?: FakeResponseReader;
    threads?: FakeThreadReader;
    trail?: FakeTrailReader;
  } = {},
) {
  const reports = overrides.reports ?? new FakeReportReader();
  const claims = overrides.claims ?? new FakeClaimReader();
  const responses = overrides.responses ?? new FakeResponseReader();
  const threads = overrides.threads ?? new FakeThreadReader();
  const trail = overrides.trail ?? new FakeTrailReader();

  return {
    service: new ReportVisibilityService({ reports, claims, responses, threads, trail }),
    reports,
    claims,
    responses,
    threads,
    trail,
  };
}

describe('ReportVisibilityService', () => {
  describe('the refusal', () => {
    it('refuses an anonymous actor, and issues no query', async () => {
      const { service, reports } = buildService();

      await expect(service.projectReport(null, 'report-1')).rejects.toThrow(
        NotFoundError,
      );

      expect(reports.reportColumns).toHaveLength(0);
    });

    it('refuses a non-member actor, and issues no query', async () => {
      const { service, reports } = buildService();

      await expect(
        service.projectReport(
          actor('pending-1', { status: 'Pending', capability: 'none' }),
          'report-1',
        ),
      ).rejects.toThrow(NotFoundError);

      expect(reports.reportColumns).toHaveLength(0);
    });

    it('refuses a missing report', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(null),
      });

      await expect(service.projectReport(actor('viewer-1'), 'report-1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('does not disclose that a report exists to a refused viewer', async () => {
      const { service } = buildService();

      // The same error, the same message — whether the report exists or not.
      const anonymous = await rejectionMessage(() => service.projectReport(null, 'report-1'));

      const missing = await rejectionMessage(() =>
        new ReportVisibilityService({
          reports: new FakeReportReader(null),
          claims: new FakeClaimReader(),
          responses: new FakeResponseReader(),
          threads: new FakeThreadReader(),
          trail: new FakeTrailReader(),
        }).projectReport(null, 'report-1'),
      );

      expect(anonymous).toBe(missing);
    });
  });

  describe('the unrelated member', () => {
    it('receives the content fields and no Sensitive Field', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(relationship()),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(projection.columns).toEqual(['unrelatedMember']);
      expect(projection.report.description).toBe('A navy blue backpack.');
      expect(projection.report.reporterDisplayName).toBe('Owner One');
      expect(projection.report.exactPlace).toBeUndefined();
      expect(projection.report.identifyingDetails).toBeUndefined();
      expect(projection.report.reporterEmail).toBeUndefined();
      expect(projection.report.reporterPhone).toBeUndefined();
    });

    it('receives no Claims, no Responses, and no trail', async () => {
      const { service, claims, responses, trail } = buildService();

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(claims.scopes).toHaveLength(0);
      expect(responses.scopes).toHaveLength(0);
      expect(projection.claims).toEqual([]);
      expect(projection.recoveryResponses).toEqual([]);
      expect(trail.called).toBe(false);
    });

    it('receives an explicit null for the trail, not an empty array', async () => {
      const { service } = buildService();

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      // "Forbidden" must be distinguishable from "empty" (ADR-8).
      expect(projection.auditTrail).toBeNull();
    });
  });

  describe('the Found-report owner', () => {
    it('receives the Sensitive Fields', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(ownedRelationship()),
      });

      const projection = await service.projectReport(actor('owner-1'), 'report-1');

      expect(projection.columns).toContain('foundReportOwner');
      expect(projection.report.exactPlace).toBe('Behind the library');
      expect(projection.report.identifyingDetails).toBe('Red tag');
      expect(projection.report.reporterEmail).toBe('owner@example.test');
      expect(projection.report.reporterPhone).toBe('+1 555 0100');
    });

    it('receives the Claims on their own report, without the private evidence', async () => {
      const { service, claims } = buildService({
        reports: new FakeReportReader(ownedRelationship()),
      });

      const projection = await service.projectReport(actor('owner-1'), 'report-1');

      // Every Claim on the report — the scope is `null`.
      expect(claims.scopes).toEqual([null]);
      expect(projection.claims).toHaveLength(2);

      // But no evidence on any of them.
      for (const claim of projection.claims) {
        expect(claim.reason).toBeUndefined();
        expect(claim.identifyingDetails).toBeUndefined();
        expect(claim.dateLost).toBeUndefined();
      }
    });

    it('receives no Recovery Responses', async () => {
      const { service, responses } = buildService({
        reports: new FakeReportReader(ownedRelationship()),
      });

      const projection = await service.projectReport(actor('owner-1'), 'report-1');

      expect(responses.scopes).toHaveLength(0);
      expect(projection.recoveryResponses).toEqual([]);
    });
  });

  describe('the claimant — participation grants nothing', () => {
    const claimantRelationship = relationship({
      claimId: 'claim-1',
      hasClaim: true,
    });

    it('receives no report-level Sensitive Field', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(claimantRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      // **The regression.** Holding the `claimant` column must not unlock
      // `exactPlace`, `identifyingDetails`, `reporterEmail`, or
      // `reporterPhone`.
      expect(projection.columns).toEqual(['unrelatedMember', 'claimant']);
      expect(projection.report.exactPlace).toBeUndefined();
      expect(projection.report.identifyingDetails).toBeUndefined();
      expect(projection.report.reporterEmail).toBeUndefined();
      expect(projection.report.reporterPhone).toBeUndefined();
    });

    it('is handed a column set that grants no Sensitive Field', async () => {
      const { service, reports } = buildService({
        reports: new FakeReportReader(claimantRelationship),
      });

      await service.projectReport(actor('viewer-1'), 'report-1');

      const columns = reports.reportColumns[0]!;

      expect(columns).not.toContain('foundReportOwner');
      expect(columns).not.toContain('lostReportOwner');
      expect(columns).not.toContain('administrator');
    });

    it('receives only their own Claim', async () => {
      const { service, claims } = buildService({
        reports: new FakeReportReader(claimantRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(claims.scopes).toEqual([['claim-1']]);
      expect(projection.claims).toHaveLength(1);
      expect(projection.claims[0]!.claimId).toBe('claim-1');
      expect(projection.claims[0]!.isOwn).toBe(true);
    });

    it('receives their own Claim evidence', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(claimantRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(projection.claims[0]!.reason).toBe('It is mine');
      expect(projection.claims[0]!.identifyingDetails).toBe('Red tag');
    });

    it('receives no Recovery Responses', async () => {
      const { service, responses } = buildService({
        reports: new FakeReportReader(claimantRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(responses.scopes).toHaveLength(0);
      expect(projection.recoveryResponses).toEqual([]);
    });

    it('receives the thread on their own Claim only', async () => {
      const { service, threads } = buildService({
        reports: new FakeReportReader(claimantRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(threads.scopes).toEqual([{ claimIds: ['claim-1'], responseIds: [] }]);
      expect(projection.threads).toHaveLength(1);
      expect(projection.threads[0]!.parentId).toBe('claim-1');
    });
  });

  describe('the recovery responder — participation grants nothing', () => {
    const responderRelationship = relationship({
      reportType: 'Lost',
      recoveryResponseId: 'response-1',
      hasRecoveryResponse: true,
    });

    it('receives no report-level Sensitive Field', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(responderRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(projection.columns).toEqual(['unrelatedMember', 'recoveryResponder']);
      expect(projection.report.exactPlace).toBeUndefined();
      expect(projection.report.identifyingDetails).toBeUndefined();
      expect(projection.report.reporterEmail).toBeUndefined();
      expect(projection.report.reporterPhone).toBeUndefined();
    });

    it('receives only their own Recovery Response', async () => {
      const { service, responses } = buildService({
        reports: new FakeReportReader(responderRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(responses.scopes).toEqual([['response-1']]);
      expect(projection.recoveryResponses).toHaveLength(1);
      expect(projection.recoveryResponses[0]!.responseId).toBe('response-1');
      expect(projection.recoveryResponses[0]!.isOwn).toBe(true);
    });

    it('receives no Claims', async () => {
      const { service, claims } = buildService({
        reports: new FakeReportReader(responderRelationship),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(claims.scopes).toHaveLength(0);
      expect(projection.claims).toEqual([]);
    });
  });

  describe('the Lost-report owner', () => {
    const ownerRelationship = ownedRelationship('Lost');

    it('receives every Recovery Response on their own report', async () => {
      const { service, responses } = buildService({
        reports: new FakeReportReader(ownerRelationship),
      });

      const projection = await service.projectReport(actor('owner-1'), 'report-1');

      expect(responses.scopes).toEqual([null]);
      expect(projection.recoveryResponses).toHaveLength(1);
    });

    it('receives the responder-supplied fields', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(ownerRelationship),
      });

      const projection = await service.projectReport(actor('owner-1'), 'report-1');

      expect(projection.recoveryResponses[0]!.whereFoundExactPlace).toBe(
        'By the fountain',
      );
      expect(projection.recoveryResponses[0]!.observedIdentifyingDetails).toBe(
        'Scuffed strap',
      );
    });

    it('receives no Claims', async () => {
      const { service, claims } = buildService({
        reports: new FakeReportReader(ownerRelationship),
      });

      const projection = await service.projectReport(actor('owner-1'), 'report-1');

      expect(claims.scopes).toHaveLength(0);
      expect(projection.claims).toEqual([]);
    });
  });

  describe('the administrator', () => {
    it('receives the trail', async () => {
      const { service, trail } = buildService({
        reports: new FakeReportReader(ownedRelationship()),
      });

      const projection = await service.projectReport(
        actor('admin-1', { isAdministrator: true }),
        'report-1',
      );

      expect(trail.called).toBe(true);
      expect(projection.auditTrail).not.toBeNull();
    });

    it('receives every Claim, with the evidence', async () => {
      const { service, claims } = buildService();

      const projection = await service.projectReport(
        actor('admin-1', { isAdministrator: true }),
        'report-1',
      );

      expect(claims.scopes).toEqual([null]);
      expect(projection.claims).toHaveLength(2);
      expect(projection.claims[0]!.reason).toBe('It is mine');
      expect(projection.claims[0]!.identifyingDetails).toBe('Red tag');
    });

    it('resolves the administrator column alone', async () => {
      const { service, reports } = buildService({
        reports: new FakeReportReader(ownedRelationship()),
      });

      await service.projectReport(
        actor('admin-1', { isAdministrator: true }),
        'report-1',
      );

      expect(reports.reportColumns[0]).toEqual(['administrator']);
    });
  });

  describe('the status history', () => {
    it('carries the current status and the last-action timestamp', async () => {
      const { service } = buildService();

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      expect(projection.report.statusHistory).toEqual({
        status: 'Open',
        lastActionAt: '2026-10-02T00:00:00.000Z',
      });
    });
  });

  describe('the projection shape', () => {
    it('never carries a null for an absent field', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(relationship()),
      });

      const projection = await service.projectReport(actor('viewer-1'), 'report-1');

      // An absent value leaves the key **off** the projection — a `null`
      // would tell the client the field exists and is empty.
      expect('exactPlace' in projection.report).toBe(false);
      expect('reporterEmail' in projection.report).toBe(false);
    });

    it('reports the field set the matrix grants', async () => {
      const { service } = buildService({
        reports: new FakeReportReader(ownedRelationship()),
      });

      const projection = await service.projectReport(actor('owner-1'), 'report-1');

      expect([...projection.reportFields].sort()).toEqual([
        'description',
        'exactPlace',
        'identifyingDetails',
        'image',
        'reporterEmail',
        'reporterName',
        'reporterPhone',
        'statusHistory',
        'summary',
      ]);
    });
  });
});
