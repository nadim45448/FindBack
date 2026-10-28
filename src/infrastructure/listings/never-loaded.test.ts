/**
 * The "never loaded" test — FR-39's central claim, asserted on the SQL.
 *
 * **The assertion is on the generated SQL, not on the response.** This is
 * the whole point of the mechanism. A response-level test would pass even
 * if the Sensitive value had been read from the database and then dropped
 * before the client saw it — and FR-39 says that is *not sufficient*: "the
 * Sensitive Field is never loaded at all, because filtering an already-
 * loaded value after the fact is not sufficient."
 *
 * So the test captures the `Prisma.Sql` the reader builds, renders it to a
 * string, and asserts that the Sensitive column's physical name **does not
 * appear**. If the column were selected, the test fails — and the failure
 * is at the query, not at the response.
 *
 * The readers are driven with a **fake Prisma client** that records the
 * `Prisma.Sql` it was handed. No database is involved, and none is needed:
 * the property under test is the shape of the query, which is fully
 * determined before it is issued.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { PrismaAuditTrailVisibilityReader } from './prisma-audit-trail-visibility-reader';
import { PrismaClaimVisibilityReader } from './prisma-claim-visibility-reader';
import { PrismaRecoveryResponseVisibilityReader } from './prisma-recovery-response-visibility-reader';
import { PrismaReportVisibilityReader } from './prisma-report-visibility-reader';
import { PrismaThreadVisibilityReader } from './prisma-thread-visibility-reader';
import type { ProjectionColumn } from '@/domain/listings';

/**
 * A fake Prisma client that records the SQL it was handed.
 *
 * The readers only ever call `$queryRaw`, so the fake implements only that.
 */
class RecordingClient {
  readonly queries: Prisma.Sql[] = [];

  async $queryRaw<T>(query: Prisma.Sql): Promise<T> {
    this.queries.push(query);
    return [] as T;
  }

  /** The SQL of the last recorded query. */
  get lastSql(): string {
    expect(this.queries.length).toBeGreaterThan(0);

    return this.queries[this.queries.length - 1]!.text;
  }

  /**
   * The bound values of the last recorded query.
   *
   * **Prisma parameterises the values, so they are not in the SQL text.** A
   * scope assertion therefore has to read the values, not the string. The
   * SQL text proves the *shape* of the query; the values prove the *scope*.
   */
  get lastValues(): readonly unknown[] {
    expect(this.queries.length).toBeGreaterThan(0);

    return this.queries[this.queries.length - 1]!.values;
  }
}

/** Narrow the fake to the client the readers accept. */
function asClient(client: RecordingClient): PrismaClient {
  return client as unknown as PrismaClient;
}

/**
 * The physical names of the FR-37 Sensitive Fields.
 *
 * These are the names that must **not** appear in the SQL for a viewer who
 * may not see them.
 */
const SENSITIVE_PHYSICAL_NAMES = [
  'exact_place',
  'identifying_details',
  'reporter_email',
  'reporter_phone',
  'where_found_exact_place',
  'observed_identifying_details',
  'candidate_image_ref',
] as const;

describe('the report query never selects a Sensitive Field the viewer may not see', () => {
  const columnSets: readonly { label: string; columns: readonly ProjectionColumn[] }[] = [
    { label: 'anonymous', columns: ['anonymous'] },
    { label: 'unrelated member', columns: ['unrelatedMember'] },
    { label: 'claimant', columns: ['unrelatedMember', 'claimant'] },
    {
      label: 'recovery responder',
      columns: ['unrelatedMember', 'recoveryResponder'],
    },
  ];

  it.each(columnSets)('$label', async ({ columns }) => {
    const client = new RecordingClient();

    await new PrismaReportVisibilityReader(asClient(client)).loadReportForViewer(
      'report-1',
      columns,
    );

    expect(client.queries).toHaveLength(1);

    const sql = client.lastSql;

    for (const name of SENSITIVE_PHYSICAL_NAMES) {
      expect(sql).not.toContain(name);
    }
  });

  it('selects the Sensitive Fields for an owner', async () => {
    const client = new RecordingClient();

    await new PrismaReportVisibilityReader(asClient(client)).loadReportForViewer(
      'report-1',
      ['foundReportOwner'],
    );

    expect(client.lastSql).toContain('exact_place');
    expect(client.lastSql).toContain('identifying_details');
  });

  it('joins the accounts table only when the reporter fields are granted', async () => {
    // The `anonymous` column grants neither the reporter's name nor their
    // contact details, so the `accounts` join is **not issued at all**.
    const withoutReporter = new RecordingClient();
    await new PrismaReportVisibilityReader(asClient(withoutReporter)).loadReportForViewer(
      'report-1',
      ['anonymous'],
    );

    expect(withoutReporter.lastSql).not.toContain('accounts');

    // The `unrelatedMember` column grants the reporter's **name** — so the
    // join is issued, and it selects `display_name` alone.
    const withName = new RecordingClient();
    await new PrismaReportVisibilityReader(asClient(withName)).loadReportForViewer(
      'report-1',
      ['unrelatedMember'],
    );

    expect(withName.lastSql).toContain('accounts');
    expect(withName.lastSql).toContain('a.display_name');
    expect(withName.lastSql).not.toContain('a.email');
    expect(withName.lastSql).not.toContain('a.phone');

    // The owner column grants the contact details as well.
    const withContact = new RecordingClient();
    await new PrismaReportVisibilityReader(asClient(withContact)).loadReportForViewer(
      'report-1',
      ['foundReportOwner'],
    );

    expect(withContact.lastSql).toContain('a.email');
    expect(withContact.lastSql).toContain('a.phone');
  });

  it('selects only the timestamp of the last action, never the event row', async () => {
    const client = new RecordingClient();

    await new PrismaReportVisibilityReader(asClient(client)).loadReportForViewer(
      'report-1',
      ['unrelatedMember'],
    );

    const sql = client.lastSql;

    expect(sql).toContain('occurred_at');
    // The trail's content — the actor, the event type, the reason, the
    // metadata — must never reach a non-administrator's query.
    expect(sql).not.toContain('actor_id');
    expect(sql).not.toContain('event_type');
    expect(sql).not.toContain('metadata');
  });
});

describe('the Claim query never selects the private evidence', () => {
  it('omits the evidence for a Found-report owner', async () => {
    const client = new RecordingClient();

    await new PrismaClaimVisibilityReader(asClient(client)).loadClaimsForViewer(
      'report-1',
      ['foundReportOwner'],
      null,
    );

    const sql = client.lastSql;

    expect(sql).toContain('c.id');
    expect(sql).toContain('c.status');
    expect(sql).not.toContain('c.reason');
    expect(sql).not.toContain('c.identifying_details');
    expect(sql).not.toContain('c.date_lost');
  });

  it('omits the evidence for a claimant', async () => {
    // The claimant's evidence is granted by the **projection**, on their own
    // Claim only. The read never carries it — so a Claim the claimant may
    // not see is not read with its evidence either.
    const client = new RecordingClient();

    await new PrismaClaimVisibilityReader(asClient(client)).loadClaimsForViewer(
      'report-1',
      ['unrelatedMember', 'claimant'],
      ['claim-1'],
    );

    const sql = client.lastSql;

    expect(sql).not.toContain('c.reason');
    expect(sql).not.toContain('c.identifying_details');
  });

  it('selects the evidence for an administrator', async () => {
    const client = new RecordingClient();

    await new PrismaClaimVisibilityReader(asClient(client)).loadClaimsForViewer(
      'report-1',
      ['administrator'],
      null,
    );

    const sql = client.lastSql;

    expect(sql).toContain('c.reason');
    expect(sql).toContain('c.identifying_details');
  });

  it('issues no query at all for an empty scope', async () => {
    const client = new RecordingClient();

    const rows = await new PrismaClaimVisibilityReader(asClient(client)).loadClaimsForViewer(
      'report-1',
      ['unrelatedMember', 'claimant'],
      [],
    );

    expect(rows).toEqual([]);
    expect(client.queries).toHaveLength(0);
  });
});

describe('the Recovery Response query never selects the responder fields', () => {
  it('issues no query for an unrelated member', async () => {
    const client = new RecordingClient();

    await new PrismaRecoveryResponseVisibilityReader(
      asClient(client),
    ).loadResponsesForViewer('report-1', ['unrelatedMember'], []);

    // The empty scope means no query at all.
    expect(client.queries).toHaveLength(0);
  });

  it('issues no query for a Found-report owner', async () => {
    const client = new RecordingClient();

    await new PrismaRecoveryResponseVisibilityReader(
      asClient(client),
    ).loadResponsesForViewer('report-1', ['unrelatedMember', 'foundReportOwner'], []);

    // The Found-report owner has no Recovery Responses at all — the scope is
    // empty, so no query is issued.
    expect(client.queries).toHaveLength(0);
  });

  it('selects the responder fields for a Lost-report owner', async () => {
    const client = new RecordingClient();

    await new PrismaRecoveryResponseVisibilityReader(
      asClient(client),
    ).loadResponsesForViewer('report-1', ['unrelatedMember', 'lostReportOwner'], null);

    const sql = client.lastSql;

    expect(sql).toContain('rr.where_found_exact_place');
    expect(sql).toContain('rr.observed_identifying_details');
    expect(sql).toContain('rr.candidate_image_ref');
  });

  it('issues no query at all for an empty scope', async () => {
    const client = new RecordingClient();

    const rows = await new PrismaRecoveryResponseVisibilityReader(
      asClient(client),
    ).loadResponsesForViewer('report-1', ['unrelatedMember', 'recoveryResponder'], []);

    expect(rows).toEqual([]);
    expect(client.queries).toHaveLength(0);
  });
});

describe('the thread query is scoped to its parents', () => {
  it('issues no query for an empty parent set', async () => {
    const client = new RecordingClient();

    const rows = await new PrismaThreadVisibilityReader(asClient(client)).loadThreadsForViewer(
      [],
      [],
      ['unrelatedMember'],
    );

    expect(rows).toEqual([]);
    expect(client.queries).toHaveLength(0);
  });

  it('scopes the query to the parent ids it was handed', async () => {
    const client = new RecordingClient();

    await new PrismaThreadVisibilityReader(asClient(client)).loadThreadsForViewer(
      ['claim-1'],
      [],
      ['unrelatedMember', 'claimant'],
    );

    // The shape of the query: a disjunction over the two parent kinds.
    expect(client.lastSql).toContain('t.parent_type');
    expect(client.lastSql).toContain('t.parent_id');

    // The scope of the query: exactly the parent ids it was handed. The
    // values are parameterised, so they are read from the query's bindings.
    expect(client.lastValues).toContain('claim-1');
    expect(client.lastValues).not.toContain('claim-2');
  });

  it('scopes the response threads separately from the claim threads', async () => {
    const client = new RecordingClient();

    await new PrismaThreadVisibilityReader(asClient(client)).loadThreadsForViewer(
      ['claim-1'],
      ['response-1'],
      ['administrator'],
    );

    expect(client.lastValues).toContain('claim-1');
    expect(client.lastValues).toContain('response-1');
  });

  it('never selects a Claim or Response column', async () => {
    const client = new RecordingClient();

    await new PrismaThreadVisibilityReader(asClient(client)).loadThreadsForViewer(
      ['claim-1'],
      ['response-1'],
      ['administrator'],
    );

    const sql = client.lastSql;

    // "Participation grants no private evidence" — a thread message carries
    // no evidence from its parent record.
    expect(sql).not.toContain('reason');
    expect(sql).not.toContain('identifying_details');
    expect(sql).not.toContain('where_found_exact_place');
  });
});

describe('the audit trail query is refused before it is issued', () => {
  it('issues no query for a non-administrator', async () => {
    const client = new RecordingClient();

    const trail = await new PrismaAuditTrailVisibilityReader(
      asClient(client),
    ).loadTrailForViewer('report-1', ['unrelatedMember']);

    // An **explicit** absence, not an empty array — "forbidden" must be
    // distinguishable from "empty" (ADR-8).
    expect(trail).toBeNull();
    expect(client.queries).toHaveLength(0);
  });

  it('issues no query for an owner', async () => {
    const client = new RecordingClient();

    const trail = await new PrismaAuditTrailVisibilityReader(
      asClient(client),
    ).loadTrailForViewer('report-1', ['foundReportOwner']);

    expect(trail).toBeNull();
    expect(client.queries).toHaveLength(0);
  });

  it('selects the full event for an administrator', async () => {
    const client = new RecordingClient();

    await new PrismaAuditTrailVisibilityReader(asClient(client)).loadTrailForViewer(
      'report-1',
      ['administrator'],
    );

    const sql = client.lastSql;

    expect(sql).toContain('actor_id');
    expect(sql).toContain('event_type');
    expect(sql).toContain('metadata');
  });
});

describe('the relationship query uses LEFT JOINs', () => {
  it('never inner-joins a Claim or a Response', async () => {
    const client = new RecordingClient();

    await new PrismaReportVisibilityReader(asClient(client)).loadRelationship(
      'report-1',
      'viewer-1',
    );

    const sql = client.lastSql;

    // An inner join would return zero rows for an unrelated member, making
    // "not related" indistinguishable from "does not exist".
    expect(sql).toContain('LEFT JOIN claims');
    expect(sql).toContain('LEFT JOIN recovery_responses');
    expect(sql).not.toMatch(/INNER JOIN/i);
  });

  it('carries no report content', async () => {
    const client = new RecordingClient();

    await new PrismaReportVisibilityReader(asClient(client)).loadRelationship(
      'report-1',
      'viewer-1',
    );

    const sql = client.lastSql;

    // The relationship query carries only ids and two equality facts.
    expect(sql).not.toContain('description');
    expect(sql).not.toContain('exact_place');
    expect(sql).not.toContain('identifying_details');
    expect(sql).not.toContain('email');
  });
});
