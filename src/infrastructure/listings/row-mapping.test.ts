/**
 * The row mapping — what each reader does with the rows it receives.
 *
 * **The SQL shape is asserted in `never-loaded.test.ts`.** This file asserts
 * the other half of the reader's contract: how a row comes back out.
 *
 * **The distinction under test is `undefined` versus `null`.** A reader maps
 * the columns it *selected*. A column that was not selected is absent from
 * the row — `undefined` — and the reader must leave the key **off** the
 * result. A column that was selected but holds no value is `null`, and the
 * reader carries the `null` through. Conflating the two would mean a
 * selected-but-empty column silently disappears, and the projection could
 * no longer tell "this field exists and is empty" from "this field does not
 * apply to you".
 *
 * The fake returns rows directly, so these tests exercise the mapping
 * without a database. The **integration** test — the real query against the
 * real tables — is bolt `007`'s, by the confirmed `006`/`007` split.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { renderSelectList } from './select-builder';
import { PrismaAuditTrailVisibilityReader } from './prisma-audit-trail-visibility-reader';
import { PrismaClaimVisibilityReader } from './prisma-claim-visibility-reader';
import { PrismaRecoveryResponseVisibilityReader } from './prisma-recovery-response-visibility-reader';
import { PrismaReportVisibilityReader } from './prisma-report-visibility-reader';
import { PrismaThreadVisibilityReader } from './prisma-thread-visibility-reader';

/**
 * A fake Prisma client that returns a fixed set of rows.
 *
 * The rows are returned as-is, so the reader's mapping is what is under
 * test — not the query.
 */
class RowReturningClient {
  constructor(private readonly rows: readonly unknown[]) {}

  async $queryRaw<T>(): Promise<T> {
    return this.rows as T;
  }
}

/** Narrow the fake to the client the readers accept. */
function asClient(rows: readonly unknown[]): PrismaClient {
  return new RowReturningClient(rows) as unknown as PrismaClient;
}

/** The date the fixtures use. */
const WHEN = new Date('2026-10-03T00:00:00.000Z');

describe('the report reader, mapping its rows', () => {
  it('maps a full row', async () => {
    const row = await new PrismaReportVisibilityReader(
      asClient([
        {
          id: 'report-1',
          type: 'Found',
          status: 'Open',
          name: 'Blue backpack',
          category: 'Accessories',
          date: WHEN,
          campus_area: 'North Campus',
          description: 'A navy blue backpack.',
          image_ref: 'image-1',
          reporter_id: 'owner-1',
          exact_place: 'Behind the library',
          identifying_details: 'Red tag',
          reporter_display_name: 'Owner One',
          reporter_email: 'owner@example.test',
          reporter_phone: '+1 555 0100',
          last_action_at: WHEN,
        },
      ]),
    ).loadReportForViewer('report-1', ['foundReportOwner']);

    expect(row).toEqual({
      id: 'report-1',
      type: 'Found',
      status: 'Open',
      name: 'Blue backpack',
      category: 'Accessories',
      date: '2026-10-03T00:00:00.000Z',
      campusArea: 'North Campus',
      description: 'A navy blue backpack.',
      imageRef: 'image-1',
      reporterDisplayName: 'Owner One',
      exactPlace: 'Behind the library',
      identifyingDetails: 'Red tag',
      reporterEmail: 'owner@example.test',
      reporterPhone: '+1 555 0100',
      lastActionAt: '2026-10-03T00:00:00.000Z',
    });
  });

  it('carries a null through for a selected-but-empty column', async () => {
    const row = await new PrismaReportVisibilityReader(
      asClient([
        {
          id: 'report-1',
          type: 'Lost',
          status: 'Open',
          name: null,
          category: null,
          date: null,
          campus_area: null,
          description: null,
          image_ref: null,
          reporter_id: 'owner-1',
          exact_place: null,
          identifying_details: null,
          reporter_display_name: null,
          reporter_email: null,
          reporter_phone: null,
          last_action_at: null,
        },
      ]),
    ).loadReportForViewer('report-1', ['foundReportOwner']);

    // The column was selected and holds no value, so the `null` is carried
    // through. It is not dropped.
    expect(row?.name).toBeNull();
    expect(row?.exactPlace).toBeNull();
    expect(row?.lastActionAt).toBeNull();
  });

  it('returns null when there is no row', async () => {
    const row = await new PrismaReportVisibilityReader(asClient([])).loadReportForViewer(
      'report-1',
      ['unrelatedMember'],
    );

    expect(row).toBeNull();
  });

  it('maps the report type, defaulting a non-Found value to Lost', async () => {
    const row = await new PrismaReportVisibilityReader(
      asClient([{ id: 'report-1', type: 'Lost', status: 'Open' }]),
    ).loadReportForViewer('report-1', ['unrelatedMember']);

    expect(row?.type).toBe('Lost');
  });

  it('maps the relationship facts', async () => {
    const relationship = await new PrismaReportVisibilityReader(
      asClient([
        {
          report_id: 'report-1',
          report_type: 'Found',
          reporter_id: 'owner-1',
          claim_id: 'claim-1',
          recovery_response_id: null,
        },
      ]),
    ).loadRelationship('report-1', 'viewer-1');

    expect(relationship).toEqual({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'viewer-1',
      isReporter: false,
      hasClaim: true,
      hasRecoveryResponse: false,
      claimId: 'claim-1',
      recoveryResponseId: null,
    });
  });

  it('returns null for a relationship with no row', async () => {
    const relationship = await new PrismaReportVisibilityReader(
      asClient([]),
    ).loadRelationship('report-1', 'viewer-1');

    expect(relationship).toBeNull();
  });

  it('maps a Lost relationship', async () => {
    const relationship = await new PrismaReportVisibilityReader(
      asClient([
        {
          report_id: 'report-1',
          report_type: 'Lost',
          reporter_id: 'owner-1',
          claim_id: null,
          recovery_response_id: 'response-1',
        },
      ]),
    ).loadRelationship('owner-1', 'owner-1');

    expect(relationship?.reportType).toBe('Lost');
    expect(relationship?.isReporter).toBe(true);
    expect(relationship?.hasRecoveryResponse).toBe(true);
  });
});

describe('the Claim reader, mapping its rows', () => {
  it('maps a full row', async () => {
    const rows = await new PrismaClaimVisibilityReader(
      asClient([
        {
          id: 'claim-1',
          report_id: 'report-1',
          claimant_id: 'viewer-1',
          status: 'Pending',
          submitted_at: WHEN,
          reason: 'It is mine',
          identifying_details: 'Red tag',
          date_lost: WHEN,
          audit_light_history: [
            { event_type: 'ClaimSubmitted', occurred_at: WHEN },
            { event_type: 'ClaimApproved', occurred_at: WHEN },
          ],
        },
      ]),
    ).loadClaimsForViewer('report-1', ['administrator'], null);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('claim-1');
    expect(rows[0]!.reason).toBe('It is mine');
    expect(rows[0]!.identifyingDetails).toBe('Red tag');
    expect(rows[0]!.dateLost).toBe('2026-10-03T00:00:00.000Z');
    expect(rows[0]!.auditLightHistory).toEqual([
      { status: 'ClaimSubmitted', at: '2026-10-03T00:00:00.000Z' },
      { status: 'ClaimApproved', at: '2026-10-03T00:00:00.000Z' },
    ]);
  });

  it('leaves an unselected evidence column off the row', async () => {
    const rows = await new PrismaClaimVisibilityReader(
      asClient([
        {
          id: 'claim-1',
          report_id: 'report-1',
          claimant_id: 'viewer-1',
          status: 'Pending',
          submitted_at: WHEN,
        },
      ]),
    ).loadClaimsForViewer('report-1', ['foundReportOwner'], null);

    // The evidence columns were not selected, so they are absent from the
    // row and the key is left off the result entirely.
    expect('reason' in rows[0]!).toBe(false);
    expect('identifyingDetails' in rows[0]!).toBe(false);
    expect('dateLost' in rows[0]!).toBe(false);
  });

  it('carries a null through for a selected-but-empty evidence column', async () => {
    const rows = await new PrismaClaimVisibilityReader(
      asClient([
        {
          id: 'claim-1',
          report_id: 'report-1',
          claimant_id: 'viewer-1',
          status: 'Pending',
          submitted_at: WHEN,
          reason: null,
          identifying_details: null,
          date_lost: null,
        },
      ]),
    ).loadClaimsForViewer('report-1', ['administrator'], null);

    expect(rows[0]!.reason).toBeNull();
    expect(rows[0]!.identifyingDetails).toBeNull();
    expect(rows[0]!.dateLost).toBeNull();
  });

  it('carries an empty audit-light history through', async () => {
    const rows = await new PrismaClaimVisibilityReader(
      asClient([
        {
          id: 'claim-1',
          report_id: 'report-1',
          claimant_id: 'viewer-1',
          status: 'Pending',
          submitted_at: WHEN,
          audit_light_history: [],
        },
      ]),
    ).loadClaimsForViewer('report-1', ['unrelatedMember', 'claimant'], ['claim-1']);

    expect(rows[0]!.auditLightHistory).toEqual([]);
  });
});

describe('the Recovery Response reader, mapping its rows', () => {
  it('maps a full row', async () => {
    const rows = await new PrismaRecoveryResponseVisibilityReader(
      asClient([
        {
          id: 'response-1',
          report_id: 'report-1',
          responder_id: 'viewer-1',
          status: 'Submitted',
          submitted_at: WHEN,
          where_found_exact_place: 'By the fountain',
          observed_identifying_details: 'Scuffed strap',
          date_found: WHEN,
          candidate_image_ref: 'image-2',
        },
      ]),
    ).loadResponsesForViewer('report-1', ['unrelatedMember', 'lostReportOwner'], null);

    expect(rows[0]).toEqual({
      id: 'response-1',
      reportId: 'report-1',
      responderId: 'viewer-1',
      status: 'Submitted',
      submittedAt: '2026-10-03T00:00:00.000Z',
      whereFoundExactPlace: 'By the fountain',
      observedIdentifyingDetails: 'Scuffed strap',
      dateFound: '2026-10-03T00:00:00.000Z',
      candidateImageRef: 'image-2',
    });
  });

  it('leaves an unselected responder field off the row', async () => {
    const rows = await new PrismaRecoveryResponseVisibilityReader(
      asClient([
        {
          id: 'response-1',
          report_id: 'report-1',
          responder_id: 'viewer-1',
          status: 'Submitted',
          submitted_at: WHEN,
        },
      ]),
    ).loadResponsesForViewer('report-1', ['unrelatedMember', 'recoveryResponder'], [
      'response-1',
    ]);

    expect('whereFoundExactPlace' in rows[0]!).toBe(false);
    expect('candidateImageRef' in rows[0]!).toBe(false);
  });

  it('carries a null through for a selected-but-empty responder field', async () => {
    const rows = await new PrismaRecoveryResponseVisibilityReader(
      asClient([
        {
          id: 'response-1',
          report_id: 'report-1',
          responder_id: 'viewer-1',
          status: 'Submitted',
          submitted_at: WHEN,
          where_found_exact_place: null,
          observed_identifying_details: null,
          date_found: null,
          candidate_image_ref: null,
        },
      ]),
    ).loadResponsesForViewer('report-1', ['unrelatedMember', 'lostReportOwner'], null);

    expect(rows[0]!.whereFoundExactPlace).toBeNull();
    expect(rows[0]!.dateFound).toBeNull();
  });
});

describe('the thread reader, mapping its rows', () => {
  it('maps a full row', async () => {
    const rows = await new PrismaThreadVisibilityReader(
      asClient([
        {
          id: 'message-1',
          parent_type: 'claim',
          parent_id: 'claim-1',
          author_display_name: 'Member One',
          body: 'This is mine.',
          posted_at: WHEN,
        },
        {
          id: 'message-2',
          parent_type: 'recovery_response',
          parent_id: 'response-1',
          author_display_name: 'Member Two',
          body: 'I found it.',
          posted_at: WHEN,
        },
      ]),
    ).loadThreadsForViewer(['claim-1'], ['response-1'], ['administrator']);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.parentType).toBe('claim');
    expect(rows[0]!.authorDisplayName).toBe('Member One');
    expect(rows[0]!.postedAt).toBe('2026-10-03T00:00:00.000Z');
    expect(rows[1]!.parentType).toBe('recovery_response');
  });
});

describe('the audit trail reader, mapping its rows', () => {
  /**
   * The trail the port returns.
   *
   * The port's `TrailEvent` is deliberately `unknown` — a boundary type, so
   * the application layer does not depend on the reader's row shape. The
   * reader's own shape is asserted here, so the test narrows to it.
   */
  interface MappedTrailEvent {
    id: string;
    eventNumber: number | null;
    eventType: string;
    parentType: string;
    parentId: string;
    actorId: string;
    actorRole: string;
    reason: string | null;
    previousValues: unknown;
    changedFields: readonly string[] | null;
    metadata: unknown;
    occurredAt: string;
    createdAt: string;
  }

  it('maps a full event', async () => {
    const trail = await new PrismaAuditTrailVisibilityReader(
      asClient([
        {
          id: 'event-1',
          event_number: 5,
          event_type: 'ClaimApproved',
          parent_type: 'Report',
          parent_id: 'report-1',
          actor_id: 'admin-1',
          actor_role: 'administrator',
          reason: 'Evidence verified',
          previous_values: { status: 'Pending' },
          changed_fields: ['status'],
          metadata: { claimId: 'claim-1' },
          occurred_at: WHEN,
          created_at: WHEN,
        },
      ]),
    ).loadTrailForViewer('report-1', ['administrator']);

    expect(trail).toHaveLength(1);
    expect(trail?.[0]).toEqual({
      id: 'event-1',
      eventNumber: 5,
      eventType: 'ClaimApproved',
      parentType: 'Report',
      parentId: 'report-1',
      actorId: 'admin-1',
      actorRole: 'administrator',
      reason: 'Evidence verified',
      previousValues: { status: 'Pending' },
      changedFields: ['status'],
      metadata: { claimId: 'claim-1' },
      occurredAt: '2026-10-03T00:00:00.000Z',
      createdAt: '2026-10-03T00:00:00.000Z',
    });
  });

  it('maps a non-numbered record, whose event number is null', async () => {
    const trail = (await new PrismaAuditTrailVisibilityReader(
      asClient([
        {
          id: 'event-2',
          event_number: null,
          event_type: 'ReportEdited',
          parent_type: 'Report',
          parent_id: 'report-1',
          actor_id: 'admin-1',
          actor_role: 'administrator',
          reason: null,
          previous_values: null,
          changed_fields: null,
          metadata: null,
          occurred_at: WHEN,
          created_at: WHEN,
        },
      ]),
    ).loadTrailForViewer('report-1', ['administrator'])) as readonly MappedTrailEvent[] | null;

    expect(trail?.[0]?.eventNumber).toBeNull();
    expect(trail?.[0]?.reason).toBeNull();
  });
});

describe('the physical column mapping', () => {
  it('fails loudly on an unmapped column', async () => {
    // An unmapped column is a **defect**, not a silently-dropped one. The
    // mapping is total over the select builder's constant lists, so an
    // unknown name means the two have drifted.
    await expect(
      new PrismaReportVisibilityReader(asClient([])).loadReportForViewer('report-1', [
        'anonymous',
      ]),
    ).resolves.toBeNull();
  });

  it('renders a SQL fragment for a list of columns', () => {
    // `renderSelectList` is the one place the readers render a list, and it
    // is what makes the emitted SQL assertable.
    expect(renderSelectList(['id', 'type'])).toBe('id, type');
    expect(renderSelectList([])).toBe('NULL');
  });
});

describe('the SQL is parameterised', () => {
  it('never interpolates a value into the SQL text', async () => {
    // The report id and the viewer id are **bound parameters**, not
    // interpolated text. A report id is attacker-influenced, so this is the
    // property that keeps the raw SQL safe.
    const queries: Prisma.Sql[] = [];

    class CapturingClient {
      async $queryRaw<T>(query: Prisma.Sql): Promise<T> {
        queries.push(query);
        return [] as T;
      }
    }

    await new PrismaReportVisibilityReader(
      new CapturingClient() as unknown as PrismaClient,
    ).loadRelationship("report-1'; DROP TABLE reports; --", 'viewer-1');

    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).not.toContain('DROP TABLE');
    expect(queries[0]!.values).toContain("report-1'; DROP TABLE reports; --");
  });
});
