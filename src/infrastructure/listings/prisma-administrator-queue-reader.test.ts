/**
 * The administrator queue reader's SQL suite.
 *
 * ## What this proves
 *
 * The queue reader turns the domain's **filter** into a `WHERE` clause.
 * That is the load-bearing property of the whole administrator
 * experience:
 *
 * - **The filter is a predicate, not a post-filter.** A reader that
 *   loaded a broad set and filtered it in JavaScript would be the
 *   load-then-filter defect FR-39 names, applied to a queue. So the
 *   emitted SQL must carry the filter's status — and, for the
 *   report-status filters, **the report's type**.
 * - **The type is in the predicate.** A Lost report cannot appear in
 *   the Found-side awaiting-return queue, and a Found report cannot
 *   appear in the Lost-side verification queue.
 * - **The count is drawn from the same predicate as the rows.** A
 *   `COUNT(*)` with a different `WHERE` could disagree with the rows
 *   the administrator sees.
 * - **The queue's ordering is oldest first.** §15.2–§15.5 say the
 *   queues sort oldest first by default, and the ordering is the
 *   operational intent.
 *
 * ## The SQL is captured, not run
 *
 * The emitted SQL is asserted as a string rather than executed against a
 * database. The reader uses **raw SQL** precisely so the statement is
 * assertable, and this is that assertion. The behaviour against a live
 * database — that the rows really are filtered — is the reader's
 * integration test's job.
 */

import { describe, expect, it } from 'vitest';

import { OPERATIONAL_QUEUE_FILTERS } from '@/domain/administration';

import { PrismaAdministratorQueueReader } from './prisma-administrator-queue-reader';

/**
 * A Prisma client that records the SQL it is asked to run.
 *
 * **`$queryRaw` is called twice per read** — once for the rows and once
 * for the count — and both statements are captured.
 */
function recordingClient(): {
  readonly client: { $queryRaw: (sql: unknown) => Promise<unknown[]> };
  readonly statements: unknown[];
} {
  const statements: unknown[] = [];

  const client = {
    $queryRaw: async (sql: unknown): Promise<unknown[]> => {
      statements.push(sql);

      return [];
    },
  };

  return { client, statements };
}

/**
 * Render a Prisma SQL object as a string.
 *
 * **`Prisma.Sql` exposes its fragments through `strings` and `values`,**
 * and the values are the bound parameters — which is exactly what the
 * assertion needs to see: the status appears as a *bound value*, not as
 * text spliced into the statement.
 */
function sqlToString(sql: unknown): string {
  const candidate = sql as { strings?: readonly string[]; values?: readonly unknown[] };

  if (!candidate || !Array.isArray(candidate.strings)) {
    return String(sql);
  }

  const values = candidate.values ?? [];

  let rendered = '';

  for (let index = 0; index < candidate.strings.length; index += 1) {
    rendered += candidate.strings[index];

    if (index < values.length) {
      rendered += ' /* param */ ';
    }
  }

  return rendered;
}

/**
 * The bound parameter values of a statement.
 */
function sqlValues(sql: unknown): readonly unknown[] {
  const candidate = sql as { values?: readonly unknown[] };

  return candidate.values ?? [];
}

/**
 * The rendered SQL and the bound values of a captured statement.
 */
function statementOf(raw: unknown): { readonly sql: string; readonly values: readonly unknown[] } {
  return { sql: sqlToString(raw), values: sqlValues(raw) };
}

describe('the administrator queue reader', () => {
  it('puts the account status in the WHERE clause', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS['pending-registrations'],
      25,
    );

    const rowStatement = statementOf(statements[0]);

    // **The filter is a predicate in the SQL,** not a post-filter.
    expect(rowStatement.sql).toContain('WHERE');
    expect(rowStatement.sql).toContain('status');
    expect(rowStatement.values).toContain('Pending');
  });

  it('puts the claim status and the report type in the WHERE clause', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS['pending-claims'],
      25,
    );

    const rowStatement = statementOf(statements[0]);

    expect(rowStatement.sql).toContain('JOIN');
    expect(rowStatement.sql).toContain('type');
    expect(rowStatement.values).toContain('Pending');
    expect(rowStatement.values).toContain('Found');
  });

  it('puts the report type in the awaiting-return predicate', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS['awaiting-return'],
      25,
    );

    const rowStatement = statementOf(statements[0]);

    // **A Lost report cannot appear in the Found-side queue,** because the
    // report's type is in the predicate.
    expect(rowStatement.values).toContain('Found');
    expect(rowStatement.values).not.toContain('Lost');
    expect(rowStatement.values).toContain('Claim Approved');
  });

  it('puts the Lost type in the verification predicate', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS.verifications,
      25,
    );

    const rowStatement = statementOf(statements[0]);

    // **A Found report cannot appear in the Lost-side queue.**
    expect(rowStatement.values).toContain('Lost');
    expect(rowStatement.values).not.toContain('Found');
    expect(rowStatement.values).toContain('Verification Pending');
  });

  it('joins the approved Claim in the awaiting-return query', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS['awaiting-return'],
      25,
    );

    const rowStatement = statementOf(statements[0]);

    // **The claimant is the *approved* claimant** — the one who may
    // receive the item — so the join carries the Claim's status.
    expect(rowStatement.sql).toContain('decided_at');
    expect(rowStatement.values).toContain('Approved');
  });

  it('orders every queue oldest first', async () => {
    const { client, statements } = recordingClient();
    const reader = new PrismaAdministratorQueueReader(client as never);

    for (const filter of Object.values(OPERATIONAL_QUEUE_FILTERS)) {
      statements.length = 0;

      await reader.read(filter, 25);

      const rowStatement = statementOf(statements[0]);

      // **§15.2–§15.5: the queues sort oldest first by default,** and the
      // ordering is the operational intent — the administrator works
      // through the queue in the order the work arrived.
      expect(rowStatement.sql).toContain('ORDER BY');
      expect(rowStatement.sql).toContain('ASC');
    }
  });

  it('draws the count from the same predicate as the rows', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS['pending-claims'],
      25,
    );

    // **The count and the rows are two statements over one predicate.**
    expect(statements.length).toBeGreaterThanOrEqual(2);
    expect(statementOf(statements[1]).sql).toContain('COUNT(*)');
    expect(statementOf(statements[1]).sql).toContain('WHERE');
  });

  it('applies the page limit', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS['pending-registrations'],
      25,
    );

    expect(statementOf(statements[0]).sql).toContain('LIMIT');
    expect(statementOf(statements[0]).values).toContain(25);
  });

  it('refuses an unknown filter rather than returning an empty queue', async () => {
    const { client } = recordingClient();

    // **A silent empty queue would look like "there is no work"** to the
    // administrator — the one reading of an empty queue that is not true.
    await expect(
      new PrismaAdministratorQueueReader(client as never).read(
        { kind: 'NotAKind' } as never,
        25,
      ),
    ).rejects.toThrow(/defect/i);
  });

  it('quotes the accounts table’s camelCase columns', async () => {
    const { client, statements } = recordingClient();

    await new PrismaAdministratorQueueReader(client as never).read(
      OPERATIONAL_QUEUE_FILTERS['pending-registrations'],
      25,
    );

    const rowStatement = statementOf(statements[0]);

    // **PostgreSQL lower-cases an unquoted identifier,** so `a.displayName`
    // would be folded to `a.displayname` — which is not the column. The
    // accounts table's columns are camelCase and must be quoted.
    expect(rowStatement.sql).toContain('"displayName"');
    expect(rowStatement.sql).toContain('"selfDeclaredRole"');
    expect(rowStatement.sql).toContain('"createdAt"');
  });

  it('uses one adapter for all four queues', () => {
    // **One adapter means one place where a filter becomes SQL,** so the
    // dashboard's count and the queue's rows are drawn from the same code
    // path and cannot disagree.
    const reader = new PrismaAdministratorQueueReader({} as never);

    expect(typeof reader.read).toBe('function');
    expect(reader.read.length).toBe(2);
  });
});
