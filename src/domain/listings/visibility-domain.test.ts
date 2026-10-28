/**
 * The domain layer — the viewer, the relationship, and the projectors.
 *
 * **The projectors are pure, so they are tested directly.** No port, no
 * database, no framework. The questions these tests answer are the ones a
 * response-level test cannot:
 *
 * - An absent value leaves the key **off** the projection — never `null`.
 * - A row that carries more than was authorised still cannot widen the
 *   projection.
 * - `isReporter` is **derived**, never asserted by a caller.
 * - A participant's column grants no report-level Sensitive Field.
 */

import { describe, expect, it } from 'vitest';
import type { ActorContext } from '@/domain/accounts/actor-context';
import {
  anonymousViewer,
  createReportRelationship,
  isAdministratorViewer,
  isMemberViewer,
  projectClaims,
  projectRecoveryResponses,
  projectReport,
  projectThreads,
  reportFieldsFor,
  viewerFromActorContext,
  visibleClaimIds,
  visibleResponseIds,
  type ClaimRow,
  type ProjectionColumn,
  type RecoveryResponseRow,
  type ReportRow,
  type ThreadMessageRow,
} from '@/domain/listings';

describe('the viewer', () => {
  it('is anonymous for a null actor', () => {
    const viewer = viewerFromActorContext(null);

    expect(viewer.kind).toBe('anonymous');
    expect(viewer.accountId).toBeNull();
    expect(viewer.isAdministrator).toBe(false);
  });

  it('is anonymous for an actor with no member capability', () => {
    // A Pending, Rejected, or Deactivated account has `capability: 'none'`
    // and therefore resolves to the anonymous viewer. FR-38 gives a
    // non-member the summary listing and nothing more.
    const pending: ActorContext = {
      actorId: 'pending-1',
      status: 'Pending',
      isAdministrator: false,
      displayName: 'Pending One',
      capability: 'none',
    };

    expect(viewerFromActorContext(pending).kind).toBe('anonymous');
  });

  it('is a member for an Active actor', () => {
    const active: ActorContext = {
      actorId: 'member-1',
      status: 'Active',
      isAdministrator: false,
      displayName: 'Member One',
      capability: 'member',
    };

    const viewer = viewerFromActorContext(active);

    expect(viewer.kind).toBe('member');
    expect(viewer.accountId).toBe('member-1');
    expect(isMemberViewer(viewer)).toBe(true);
    expect(isAdministratorViewer(viewer)).toBe(false);
  });

  it('carries the administrator flag', () => {
    const administrator: ActorContext = {
      actorId: 'admin-1',
      status: 'Active',
      isAdministrator: true,
      displayName: 'Admin One',
      capability: 'member',
    };

    const viewer = viewerFromActorContext(administrator);

    expect(isAdministratorViewer(viewer)).toBe(true);
  });

  it('builds an anonymous viewer directly', () => {
    expect(anonymousViewer()).toEqual({
      kind: 'anonymous',
      accountId: null,
      isAdministrator: false,
      displayName: null,
    });
  });
});

describe('the report relationship', () => {
  it('derives isReporter from the id equality, never from a supplied flag', () => {
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'owner-1',
      claimId: null,
      recoveryResponseId: null,
    });

    expect(relationship.isReporter).toBe(true);
  });

  it('does not make a viewer the reporter when the ids differ', () => {
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'viewer-1',
      claimId: null,
      recoveryResponseId: null,
    });

    expect(relationship.isReporter).toBe(false);
  });

  it('derives hasClaim from the claim id', () => {
    const withClaim = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'viewer-1',
      claimId: 'claim-1',
      recoveryResponseId: null,
    });

    const withoutClaim = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'viewer-1',
      claimId: null,
      recoveryResponseId: null,
    });

    expect(withClaim.hasClaim).toBe(true);
    expect(withoutClaim.hasClaim).toBe(false);
  });

  it('reports no participation for an anonymous viewer', () => {
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: null,
      claimId: null,
      recoveryResponseId: null,
    });

    expect(relationship.isReporter).toBe(false);
    expect(relationship.hasClaim).toBe(false);
    expect(relationship.hasRecoveryResponse).toBe(false);
  });
});

describe('the report projector', () => {
  const row: ReportRow = {
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

  it('copies the summary fields for every column', () => {
    for (const columns of [
      ['anonymous'],
      ['unrelatedMember'],
      ['foundReportOwner'],
      ['administrator'],
    ] as readonly ProjectionColumn[][]) {
      const projected = projectReport(row, columns);

      expect(projected.id).toBe('report-1');
      expect(projected.name).toBe('Blue backpack');
      expect(projected.category).toBe('Accessories');
      expect(projected.campusArea).toBe('North Campus');
    }
  });

  it('copies the content fields for an authenticated column', () => {
    const projected = projectReport(row, ['unrelatedMember']);

    expect(projected.description).toBe('A navy blue backpack.');
    expect(projected.imageRef).toBe('image-1');
    expect(projected.reporterDisplayName).toBe('Owner One');
  });

  it('copies the Sensitive fields for an owner', () => {
    const projected = projectReport(row, ['foundReportOwner']);

    expect(projected.exactPlace).toBe('Behind the library');
    expect(projected.identifyingDetails).toBe('Red tag');
    expect(projected.reporterEmail).toBe('owner@example.test');
    expect(projected.reporterPhone).toBe('+1 555 0100');
  });

  it('copies no Sensitive field for a participant', () => {
    const projected = projectReport(row, ['unrelatedMember', 'claimant']);

    expect('exactPlace' in projected).toBe(false);
    expect('identifyingDetails' in projected).toBe(false);
    expect('reporterEmail' in projected).toBe(false);
    expect('reporterPhone' in projected).toBe(false);
  });

  it('does not widen the projection from a row that carries more', () => {
    // The row carries every field, but the column set grants only the
    // summary. The projector copies **only** what the set grants — a row
    // loaded with more than was authorised still cannot widen the
    // projection.
    const projected = projectReport(row, ['anonymous']);

    expect(projected.description).toBeUndefined();
    expect(projected.exactPlace).toBeUndefined();
    expect(projected.reporterEmail).toBeUndefined();
  });

  it('leaves an absent value off the projection entirely', () => {
    const projected = projectReport(
      { id: 'report-1', type: 'Found', status: 'Open', name: null },
      ['unrelatedMember'],
    );

    // Not `null` — the key is **off**, because a `null` would tell the
    // client the field exists and is empty.
    expect('name' in projected).toBe(false);
    expect('description' in projected).toBe(false);
  });

  it('carries the status history for an authenticated column', () => {
    const projected = projectReport(row, ['unrelatedMember']);

    expect(projected.statusHistory).toEqual({
      status: 'Open',
      lastActionAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('carries no status history for the anonymous column', () => {
    const projected = projectReport(row, ['anonymous']);

    expect(projected.statusHistory).toBeUndefined();
  });
});

describe('the field set', () => {
  it('grants the summary alone to the anonymous column', () => {
    expect([...reportFieldsFor(['anonymous'])]).toEqual(['summary']);
  });

  it('grants the content to every authenticated column', () => {
    for (const columns of [
      ['unrelatedMember'],
      ['claimant'],
      ['recoveryResponder'],
    ] as readonly ProjectionColumn[][]) {
      const fields = reportFieldsFor(columns);

      expect(fields.has('description')).toBe(true);
      expect(fields.has('image')).toBe(true);
      expect(fields.has('reporterName')).toBe(true);
      expect(fields.has('statusHistory')).toBe(true);
    }
  });

  it('grants the Sensitive fields only to an owner or the administrator', () => {
    expect(reportFieldsFor(['foundReportOwner']).has('exactPlace')).toBe(true);
    expect(reportFieldsFor(['lostReportOwner']).has('exactPlace')).toBe(true);
    expect(reportFieldsFor(['administrator']).has('exactPlace')).toBe(true);

    expect(reportFieldsFor(['unrelatedMember']).has('exactPlace')).toBe(false);
    expect(reportFieldsFor(['claimant']).has('exactPlace')).toBe(false);
    expect(reportFieldsFor(['recoveryResponder']).has('exactPlace')).toBe(false);
  });
});

describe('the Claim projector', () => {
  const rows: readonly ClaimRow[] = [
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

  it('returns no Claims for an unrelated member', () => {
    expect(projectClaims(rows, ['unrelatedMember'], null)).toEqual([]);
  });

  it('grants the owner the Claims without the private evidence', () => {
    const projected = projectClaims(rows, ['foundReportOwner'], null);

    expect(projected).toHaveLength(2);

    for (const claim of projected) {
      expect(claim.reason).toBeUndefined();
      expect(claim.identifyingDetails).toBeUndefined();
      expect(claim.dateLost).toBeUndefined();
    }
  });

  it('grants the claimant the evidence on their own Claim only', () => {
    const projected = projectClaims(rows, ['unrelatedMember', 'claimant'], 'claim-1');

    expect(projected).toHaveLength(2);
    expect(projected[0]!.reason).toBe('It is mine');
    expect(projected[1]!.reason).toBeUndefined();
  });

  it('grants the administrator the evidence on every Claim', () => {
    const projected = projectClaims(rows, ['administrator'], null);

    expect(projected[0]!.reason).toBe('It is mine');
  });

  it('scopes the visible Claim ids to the claimant', () => {
    expect(visibleClaimIds(rows, ['unrelatedMember', 'claimant'], 'claim-1')).toEqual([
      'claim-1',
    ]);
  });

  it('scopes the visible Claim ids to every Claim for the owner', () => {
    expect(visibleClaimIds(rows, ['foundReportOwner'], null)).toEqual([
      'claim-1',
      'claim-2',
    ]);
  });

  it('scopes the visible Claim ids to none for an unrelated member', () => {
    expect(visibleClaimIds(rows, ['unrelatedMember'], null)).toEqual([]);
  });
});

describe('the Recovery Response projector', () => {
  const rows: readonly RecoveryResponseRow[] = [
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

  it('returns no Responses for an unrelated member', () => {
    expect(projectRecoveryResponses(rows, ['unrelatedMember'], null)).toEqual([]);
  });

  it('grants the responder their own response in full', () => {
    const projected = projectRecoveryResponses(
      rows,
      ['unrelatedMember', 'recoveryResponder'],
      'response-1',
    );

    expect(projected).toHaveLength(1);
    expect(projected[0]!.whereFoundExactPlace).toBe('By the fountain');
    expect(projected[0]!.observedIdentifyingDetails).toBe('Scuffed strap');
    expect(projected[0]!.candidateImageRef).toBe('image-2');
    expect(projected[0]!.isOwn).toBe(true);
  });

  it('grants the Lost-report owner every response in full', () => {
    const projected = projectRecoveryResponses(rows, ['lostReportOwner'], null);

    expect(projected[0]!.whereFoundExactPlace).toBe('By the fountain');
  });

  it('scopes the visible Response ids to the responder', () => {
    expect(
      visibleResponseIds(rows, ['unrelatedMember', 'recoveryResponder'], 'response-1'),
    ).toEqual(['response-1']);
  });

  it('scopes the visible Response ids to none for a claimant', () => {
    expect(visibleResponseIds(rows, ['unrelatedMember', 'claimant'], null)).toEqual([]);
  });
});

describe('the thread projector', () => {
  const rows: readonly ThreadMessageRow[] = [
    {
      id: 'message-1',
      parentType: 'claim',
      parentId: 'claim-1',
      authorDisplayName: 'Member One',
      body: 'This is mine.',
      postedAt: '2026-10-03T01:00:00.000Z',
    },
    {
      id: 'message-2',
      parentType: 'recovery_response',
      parentId: 'response-1',
      authorDisplayName: 'Member Two',
      body: 'I found it.',
      postedAt: '2026-10-03T02:00:00.000Z',
    },
  ];

  it('groups the messages by parent', () => {
    const projected = projectThreads(rows, ['administrator'], {
      claimIds: ['claim-1'],
      responseIds: ['response-1'],
    });

    expect(projected).toHaveLength(2);
    expect(projected[0]!.parentType).toBe('claim');
    expect(projected[0]!.messages).toHaveLength(1);
  });

  it('drops a thread whose parent is not in the scoped set', () => {
    const projected = projectThreads(rows, ['unrelatedMember', 'claimant'], {
      claimIds: ['claim-1'],
      responseIds: [],
    });

    expect(projected).toHaveLength(1);
    expect(projected[0]!.parentType).toBe('claim');
  });

  it('drops every thread for an unrelated member', () => {
    const projected = projectThreads(rows, ['unrelatedMember'], {
      claimIds: [],
      responseIds: [],
    });

    expect(projected).toEqual([]);
  });

  it('never widens the parent set', () => {
    // The parents are already scoped. The projector can only narrow them.
    const projected = projectThreads(rows, ['unrelatedMember'], {
      claimIds: ['claim-1'],
      responseIds: [],
    });

    expect(projected).toEqual([]);
  });
});
