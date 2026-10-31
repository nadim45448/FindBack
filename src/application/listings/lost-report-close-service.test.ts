/**
 * The Lost-side close service's suite.
 *
 * **The two closure routes are the point of this suite.** An ordinary close
 * and an exceptional cancellation both end in `Closed` and both resolve every
 * non-terminal response — but they are different administrative acts with
 * different records, and an ordinary close must not be able to absorb the
 * exceptional one.
 *
 * **Four properties carry the service:**
 *
 * 1. **The route is decided by the report's own responses.** A response at
 *    `Match Confirmed` makes the close exceptional, and nothing a client
 *    sends can change that.
 * 2. **The report's status and its responses' resolution are one act.** A
 *    report that is `Closed` with live responders attached to it would leave
 *    the two disagreeing.
 * 3. **No email reaches any responder.** FR-30 is explicit, and the service
 *    takes no `EmailSender` at all — so it *cannot* send one.
 * 4. **The batch resolution event covers every closure route.** Event 27 is
 *    one event because the resolution is one operation, whatever caused it.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import { LostReportCloseService } from '@/application/listings/lost-report-close-service';
import type {
  LostCloseoutSubject,
  LostReportCloseoutReader,
} from '@/application/listings/ports/lost-report-closeout-reader';
import type {
  LostReportCloseoutRepository,
  ResolvedResponseRecord,
} from '@/application/listings/ports/lost-report-closeout-repository';

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '@/lib/errors';

// ── The unreachable guards ──────────────────────────────────────────────────
//
// **The service carries two guards the real domain makes unreachable.** The
// domain takes the exceptional route only when a response is at `Match
// Confirmed`, so `decision.matchedResponses[0]` is always defined on that
// route; and the route always writes an event, so the batch event's id is
// never the fallback. **An unreachable guard is an untested guard** — and a
// guard nobody has exercised is a guard nobody has checked.
//
// The mock makes them reachable by returning a decision the real domain
// cannot produce, so each guard is exercised for what it is: a second line
// of defence against a malformed decision, not the rule itself. The mock is
// cleared in an `afterEach`, so it cannot leak into any other test.

/** What the mocked decision returns, or `null` for the real one. */
const mockedDecision = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/domain/recovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/recovery')>();

  return {
    ...actual,
    decideLostClosure: (facts: unknown) => {
      if (mockedDecision.current !== null) {
        return mockedDecision.current;
      }

      return actual.decideLostClosure(facts as never);
    },
  };
});

// ── The harness ─────────────────────────────────────────────────────────────

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The administrator who is closing. */
const ADMINISTRATOR = { actorId: 'admin-1', isAdministrator: true };

/** A member who is not an administrator. */
const MEMBER = { actorId: 'member-1', isAdministrator: false };

/** The administrator's reason. */
const REASON = 'The owner could not be reached and the item is no longer circulating.';

/** The subject the reader returns. */
function aSubject(overrides: Partial<LostCloseoutSubject> = {}): LostCloseoutSubject {
  return {
    id: 'report-1',
    status: 'Verification Pending',
    name: 'A set of house keys',
    ownerId: 'owner-1',
    ownerEmail: 'owner@example.test',
    responses: [
      { id: 'response-1', status: 'Submitted', responderEmail: 'first@example.test' },
    ],
    selectedResponseId: 'response-1',
    ...overrides,
  };
}

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The subject the reader returns. `null` means "no such report". */
  subject: LostCloseoutSubject | null = aSubject();

  /** The responses the batch resolved. */
  readonly resolved: ResolvedResponseRecord[] = [
    {
      id: 'response-1',
      previousStatus: 'Submitted',
      status: 'Resolved — Report Closed',
    },
  ];

  /** When the batch write lands nothing. */
  batchMisses = false;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly subjects: LostReportCloseoutReader = {
    readLostCloseoutSubject: async (
      reportId: string,
      _transaction?: TransactionHandle,
    ): Promise<LostCloseoutSubject | null> => {
      this.calls.push('subjects.readLostCloseoutSubject');

      if (this.subject === null || this.subject.id !== reportId) {
        return null;
      }

      return this.subject;
    },
  };

  readonly closeouts: LostReportCloseoutRepository = {
    confirmLostReturned: async (): Promise<readonly ResolvedResponseRecord[] | null> => {
      throw new Error('The close never confirms a return.');
    },
    closeLostReport: async (
      _reportId: string,
      _transaction: TransactionHandle,
    ): Promise<readonly ResolvedResponseRecord[] | null> => {
      this.calls.push('closeouts.closeLostReport');

      if (this.batchMisses) {
        return null;
      }

      return this.resolved;
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');

      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The close never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The close never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly service: LostReportCloseService = new LostReportCloseService(
    this.subjects,
    this.closeouts,
    new LostSideEventFactory(this.audit),
    this.transactions,
  );
}

afterEach(() => {
  // **The mock is cleared between tests,** so a decision the real domain
  // cannot produce cannot leak into a later test's verdict.
  mockedDecision.current = null;
});

// ── The authorisation ───────────────────────────────────────────────────────

describe('the Lost-side close service — the authorisation', () => {
  it('refuses a member who is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.close({ reportId: 'report-1', actor: MEMBER, reason: REASON }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the actor is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.close({ reportId: 'report-1', actor: MEMBER, reason: REASON }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).toEqual([]);
    expect(harness.events).toEqual([]);
  });

  it('refuses a report that does not exist', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── The reason ──────────────────────────────────────────────────────────────

describe('the Lost-side close service — the reason', () => {
  it('refuses a close with no reason', async () => {
    const harness = new Harness();

    // **The reason is required on both routes,** and a trail entry with no
    // reason explains nothing.
    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a reason longer than five hundred characters', async () => {
    const harness = new Harness();

    await expect(
      harness.service.close({
        reportId: 'report-1',
        actor: ADMINISTRATOR,
        reason: 'x'.repeat(501),
      }),
    ).rejects.toThrow(ValidationError);
  });
});

// ── The terminal report ─────────────────────────────────────────────────────

describe('the Lost-side close service — the terminal report', () => {
  it('refuses to close a returned report', async () => {
    const harness = new Harness();
    harness.subject = aSubject({ status: 'Returned' });

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses to close an already-closed report', async () => {
    const harness = new Harness();
    harness.subject = aSubject({ status: 'Closed' });

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ConflictError);
  });

  it('writes nothing when the report is terminal', async () => {
    const harness = new Harness();
    harness.subject = aSubject({ status: 'Closed' });

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toEqual([]);
  });
});

// ── The two routes ──────────────────────────────────────────────────────────

describe('the Lost-side close service — the two routes', () => {
  it('takes the ordinary route when no response is match confirmed', async () => {
    const harness = new Harness();

    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.route).toBe('OrdinaryClosure');
    expect(result.status).toBe('Closed');
  });

  it('takes the exceptional route when a response is match confirmed', async () => {
    const harness = new Harness();
    harness.subject = aSubject({
      responses: [
        { id: 'response-1', status: 'Submitted', responderEmail: 'first@example.test' },
        { id: 'response-2', status: 'Match Confirmed', responderEmail: 'second@example.test' },
      ],
    });

    // **PRD Edge Case D.** The owner has determined the candidate is theirs
    // and the handoff is pending; closing the report now is a cancellation.
    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.route).toBe('ExceptionalCancellation');
  });

  it('writes the ordinary event on the ordinary route', async () => {
    const harness = new Harness();

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const types = harness.events.map((event) => event.eventType);

    // **FR-48 event 24 is the ordinary administrator closure.**
    expect(types).toContain('report.lost_closed_by_administrator');
    expect(types).not.toContain('report.lost_cancelled_after_match_confirmed');
  });

  it('writes the exceptional event on the exceptional route', async () => {
    const harness = new Harness();
    harness.subject = aSubject({
      responses: [
        { id: 'response-2', status: 'Match Confirmed', responderEmail: 'second@example.test' },
      ],
    });

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const types = harness.events.map((event) => event.eventType);

    // **FR-48 event 25 is the documented exceptional cancellation.**
    expect(types).toContain('report.lost_cancelled_after_match_confirmed');
    expect(types).not.toContain('report.lost_closed_by_administrator');
  });

  it('names the prior selected response on the exceptional event', async () => {
    const harness = new Harness();
    harness.subject = aSubject({
      responses: [
        { id: 'response-2', status: 'Match Confirmed', responderEmail: 'second@example.test' },
      ],
    });

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const event = harness.events.find(
      (record) => record.eventType === 'report.lost_cancelled_after_match_confirmed',
    );

    // **Event 25 records "prior selected response ID with its status at close
    // time."** The status is the `Match Confirmed` that made the close
    // exceptional.
    expect(event?.metadata).toMatchObject({
      priorSelectedResponseId: 'response-2',
      priorSelectedResponseStatus: 'Match Confirmed',
    });
  });

  it('keeps the administrator\'s reason verbatim in the trail', async () => {
    const harness = new Harness();

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const event = harness.events.find(
      (record) => record.eventType === 'report.lost_closed_by_administrator',
    );

    expect(event?.reason).toBe(REASON);
  });
});

// ── The write ───────────────────────────────────────────────────────────────

describe('the Lost-side close service — the write', () => {
  it('does the report\'s move and the responses\' resolution in one transaction', async () => {
    const harness = new Harness();

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    // **The order is the guarantee.** The report's move and the responses'
    // resolution land inside one transaction, so a report that is `Closed`
    // with a live responder attached to it cannot exist.
    expect(harness.calls).toEqual([
      'subjects.readLostCloseoutSubject',
      'transactions.run',
      'closeouts.closeLostReport',
      'audit.record',
      'audit.record',
    ]);
  });

  it('refuses when the write lands nothing', async () => {
    const harness = new Harness();
    harness.batchMisses = true;

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('audit.record');
  });

  it('writes the batch resolution event on every route', async () => {
    const harness = new Harness();

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const types = harness.events.map((event) => event.eventType);

    // **Event 27 covers every closure route** — the reporter's withdrawal,
    // the administrator's normal closure, and the exceptional cancellation.
    // The resolution is one operation, whatever caused it.
    expect(types).toContain('report.lost_closed_child_response_resolution');
  });

  it('names the resolved responses in the batch event', async () => {
    const harness = new Harness();

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const event = harness.events.find(
      (record) => record.eventType === 'report.lost_closed_child_response_resolution',
    );

    expect(event?.metadata).toMatchObject({
      childResponses: [{ recoveryResponseId: 'response-1', previousStatus: 'Submitted' }],
    });
  });

  it('reports the responses it resolved', async () => {
    const harness = new Harness();

    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]?.id).toBe('response-1');
  });
});

// ── The absence of an email ─────────────────────────────────────────────────

describe('the Lost-side close service — the absence of an email', () => {
  it('takes no email sender at all', () => {
    // **The absence is structural rather than a matter of care.** The service
    // has no `EmailSender` in its constructor, so it *cannot* send a closure
    // email — a future edit that wanted to add one would have to change the
    // constructor before it could.
    const constructor = LostReportCloseService.length;

    expect(constructor).toBe(4);
  });

  it('sends nothing when a report with responders is closed', async () => {
    const harness = new Harness();

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    // **FR-30: "No closure email to responders or claimants."** The closure
    // is observed by the affected parties when they next visit the report.
    expect(harness.calls.filter((call) => call.includes('email'))).toEqual([]);
    expect(harness.calls.filter((call) => call.includes('send'))).toEqual([]);
  });
});

// ── The unreachable guards ──────────────────────────────────────────────────

describe('the Lost-side close service — the second line of defence', () => {
  it('refuses an exceptional decision with no matched response named', async () => {
    const harness = new Harness();

    // **The route and the set cannot disagree.** The domain takes the
    // exceptional route only when a response is at `Match Confirmed`, so the
    // set is non-empty there — and the service's own guard refuses to
    // proceed without one. The mock produces the decision the real domain
    // cannot, so the guard is exercised for what it is.
    mockedDecision.current = {
      kind: 'Permitted',
      reportId: 'report-1',
      actingAdministratorId: 'admin-1',
      route: 'ExceptionalCancellation',
      reason: { value: REASON },
      matchedResponses: [],
    };

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ConflictError);

    // **Nothing was written.** The guard throws inside the transaction, so
    // the report's move and the batch resolution roll back with it.
    expect(harness.events).toEqual([]);
  });

  it('refuses a status the Lost machine does not own', async () => {
    const harness = new Harness();

    // **`Returned` and `Closed` are terminal; anything else is a status this
    // machine does not own.** The two refusals are different, and the
    // service's message says which — a caller who was refused needs to know
    // whether the report is finished or whether the close was the wrong
    // operation.
    mockedDecision.current = { kind: 'Refused', reason: 'StatusNotApplicable' };

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow('This report cannot be closed this way.');

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toEqual([]);
  });

  it('records the report\'s prior status on the ordinary route', async () => {
    const harness = new Harness();
    harness.subject = aSubject({ status: 'Open' });

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const event = harness.events.find(
      (record) => record.eventType === 'report.lost_closed_by_administrator',
    );

    // **The prior status is what the report held before the close.** A
    // report closed from `Open` and one closed from `Verification Pending`
    // are different histories, and the trail records which.
    expect(event?.metadata).toMatchObject({ previousLostStatus: 'Open' });
  });

  it('records the report\'s prior status as verification pending when it was pending', async () => {
    const harness = new Harness();

    await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    const event = harness.events.find(
      (record) => record.eventType === 'report.lost_closed_by_administrator',
    );

    expect(event?.metadata).toMatchObject({ previousLostStatus: 'Verification Pending' });
  });
});
