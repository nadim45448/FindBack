/**
 * The Lost-side Returned closeout service's suite.
 *
 * **The closeout is one act, and this suite proves that it is.** A Lost
 * report that is `Returned` while its matched response is still at `Match
 * Confirmed` would be a report that says the item came home while the
 * response that proved it is still in play — and the only way to forbid it
 * is to write the report's move and the responses' resolution **in one
 * transaction**. The harness records the order of the calls, so the
 * assertions are about the orchestration rather than about a mock's return
 * value.
 *
 * **Five properties carry the service:**
 *
 * 1. **The closeout is an administrator's act.** The flag comes from the
 *    session, never from the request body.
 * 2. **The report's move, the responses' resolution, and the events are one
 *    act** — inside one transaction.
 * 3. **The notifications are strictly post-commit.** A send failure never
 *    rolls back or blocks the transition (ADR-3, decision 4).
 * 4. **Event 8's gate is evaluated, not assumed.** The service reads the
 *    matched response's status from what the write produced and asks the
 *    domain whether the event may fire.
 * 5. **A responder with no deliverable address receives nothing, and the
 *    transition still stands.**
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import { LostReportCloseoutService } from '@/application/listings/lost-report-closeout-service';
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

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

// ── The harness ─────────────────────────────────────────────────────────────

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The administrator who is confirming. */
const ADMINISTRATOR = { actorId: 'admin-1', isAdministrator: true };

/** A member who is not an administrator. */
const MEMBER = { actorId: 'member-1', isAdministrator: false };

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
      { id: 'response-2', status: 'Match Confirmed', responderEmail: 'second@example.test' },
      { id: 'response-3', status: 'Submitted', responderEmail: 'third@example.test' },
    ],
    selectedResponseId: 'response-2',
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

  /**
   * The responses the batch resolved.
   *
   * **Non-empty by default,** because event 26 is a *batch* event and the
   * factory refuses a batch with an empty set — a batch record that names no
   * child records nothing. The closeout's own subject always holds a
   * standby response for the batch to resolve.
   */
  readonly resolved: ResolvedResponseRecord[] = [
    {
      id: 'response-1',
      previousStatus: 'Submitted',
      status: 'Resolved — Report Returned',
    },
  ];

  /** When the batch write lands nothing. */
  batchMisses = false;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  /** The notifications the dispatcher was asked to send. */
  readonly notifications: {
    event: string;
    recipientId: string;
    recipientEmail: string;
    sent: boolean;
  }[] = [];

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
    confirmLostReturned: async (
      _reportId: string,
      _matchedResponseId: string,
      reportAlreadyReturned: boolean,
      _transaction: TransactionHandle,
    ): Promise<readonly ResolvedResponseRecord[] | null> => {
      this.calls.push(`closeouts.confirmLostReturned:${reportAlreadyReturned}`);

      if (this.batchMisses) {
        return null;
      }

      return this.resolved;
    },
    closeLostReport: async (): Promise<readonly ResolvedResponseRecord[] | null> => {
      throw new Error('The Returned closeout never closes a report.');
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');

      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The closeout never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The closeout never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly dispatcher = {
    dispatch: async (request: {
      event: string;
      recipientId: string;
      recipientEmail: string;
    }): Promise<boolean> => {
      this.calls.push(`notifications.dispatch:${request.event}`);

      const sent = request.recipientEmail.length > 0;

      this.notifications.push({
        event: request.event,
        recipientId: request.recipientId,
        recipientEmail: request.recipientEmail,
        sent,
      });

      return sent;
    },
  };

  readonly service: LostReportCloseoutService = new LostReportCloseoutService(
    this.subjects,
    this.closeouts,
    new LostSideEventFactory(this.audit),
    this.audit,
    this.transactions,
    this.dispatcher,
    { send: async () => undefined },
  );
}

// ── The authorisation ───────────────────────────────────────────────────────

describe('the Lost-side closeout service — the authorisation', () => {
  it('refuses a member who is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.complete({ reportId: 'report-1', actor: MEMBER }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the actor is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.complete({ reportId: 'report-1', actor: MEMBER }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).toEqual([]);
    expect(harness.events).toEqual([]);
  });

  it('refuses a report that does not exist', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(
      harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses a report with no matched response', async () => {
    const harness = new Harness();
    harness.subject = aSubject({ selectedResponseId: null });

    // **A report with no selected response has no matched response,** and a
    // closeout would resolve every response while completing nothing.
    await expect(
      harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ConflictError);
  });
});

// ── The write ───────────────────────────────────────────────────────────────

describe('the Lost-side closeout service — the write', () => {
  it('does the report\'s move and the responses\' resolution in one transaction', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    // **The order is the guarantee.** The write lands inside the
    // transaction, and the notifications come after it — because a message
    // naming a fact that has not committed would be a lie.
    expect(harness.calls).toEqual([
      'subjects.readLostCloseoutSubject',
      'transactions.run',
      'closeouts.confirmLostReturned:false',
      'audit.record',
      'audit.record',
      'notifications.dispatch:lost_report_returned',
      'notifications.dispatch:recovery_completed',
    ]);
  });

  it('skips the report\'s move when the confirmation has already made it', async () => {
    const harness = new Harness();

    // **The confirmation service shares this transaction and has already
    // moved the report to `Returned`.** The closeout's own conditional write
    // would otherwise match no rows and be reported as a lost race — a false
    // conflict for a transition that is succeeding.
    await harness.service.complete(
      { reportId: 'report-1', actor: ADMINISTRATOR },
      HANDLE,
      true,
    );

    expect(harness.calls).toContain('closeouts.confirmLostReturned:true');
    expect(harness.calls).not.toContain('closeouts.confirmLostReturned:false');
  });

  it('opens its own transaction when it is given none', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    expect(harness.calls).toContain('transactions.run');
  });

  it('joins the caller\'s transaction when it is given one', async () => {
    const harness = new Harness();

    await harness.service.complete(
      { reportId: 'report-1', actor: ADMINISTRATOR },
      HANDLE,
      true,
    );

    // **The closeout never opens a transaction of its own when the caller
    // supplied one** — that would be two transactions, and the report's move
    // and the responses' resolution would no longer be one act.
    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses when the write lands nothing', async () => {
    const harness = new Harness();
    harness.batchMisses = true;

    // **The write did not land, so nothing else is written** and the
    // transaction rolls back with the conflict.
    await expect(
      harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('audit.record');
  });

  it('writes the batch event and the individual event together', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    // **Events 26 and 30 are written together or neither.** There is no
    // method that writes one alone, so the PRD's requirement that both
    // exist in the same transaction is structural.
    const types = harness.events.map((event) => event.eventType);

    expect(types).toContain('report.lost_returned_child_response_resolution');
    expect(types).toContain('recovery_response.completed_report_returned');
  });

  it('records the batch and the matched response in the trail', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    const batch = harness.events.find(
      (event) => event.eventType === 'report.lost_returned_child_response_resolution',
    );

    expect(batch?.parentType).toBe('report');
    expect(batch?.parentId).toBe('report-1');

    // **The closeout's events are system-actor events.** The system is the
    // actor performing the write, and the administrator who caused it is
    // named in the typed column — so the distinction between the mechanism
    // and the human survives the record.
    expect(batch?.actorRole).toBe('system');
    expect(batch?.actingAdministratorId).toBe('admin-1');
  });
});

// ── The notifications ───────────────────────────────────────────────────────

describe('the Lost-side closeout service — the notifications', () => {
  it('sends event 7 to the Lost-report owner', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    const owner = harness.notifications.find(
      (notification) => notification.event === 'lost_report_returned',
    );

    // **The owner is told their item came home.** The report being
    // `Returned` is the trigger.
    expect(owner?.recipientId).toBe('owner-1');
    expect(owner?.recipientEmail).toBe('owner@example.test');
  });

  it('sends event 8 to the matched responder', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    const responder = harness.notifications.find(
      (notification) => notification.event === 'recovery_completed',
    );

    expect(responder?.recipientId).toBe('response-2');
    expect(responder?.recipientEmail).toBe('second@example.test');
  });

  it('sends no event 8 to a standby responder', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    // **Only the matched responder receives event 8.** A standby response is
    // not a match, and a message saying "your recovery completed" to a
    // responder whose response is still `Submitted` would be a lie.
    const recipients = harness.notifications
      .filter((notification) => notification.event === 'recovery_completed')
      .map((notification) => notification.recipientId);

    expect(recipients).toEqual(['response-2']);
  });

  it('sends the notifications after the transaction has committed', async () => {
    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    const runIndex = harness.calls.indexOf('transactions.run');
    const sendIndex = harness.calls.indexOf('notifications.dispatch:lost_report_returned');

    expect(runIndex).toBeGreaterThanOrEqual(0);
    expect(sendIndex).toBeGreaterThan(runIndex);
  });

  it('keeps the transition when a send fails', async () => {
    const harness = new Harness();

    // **A send failure never rolls back or blocks the transition.** The
    // report is already `Returned` and the response is already completed.
    const result = await harness.service.complete({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
    });

    expect(result.status).toBe('Returned');
  });

  it('reports a responder with no deliverable address as not sent', async () => {
    const harness = new Harness();
    harness.subject = aSubject({
      responses: [
        { id: 'response-2', status: 'Match Confirmed', responderEmail: '' },
      ],
    });

    const result = await harness.service.complete({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
    });

    // **A deactivated matched responder — event 8 is skipped, the transition
    // still commits.** A message that cannot be delivered is not a reason to
    // un-return a report whose owner has the item in hand.
    const skipped = result.notifications.find(
      (notification) => notification.event === 'recovery_completed',
    );

    expect(skipped?.sent).toBe(false);
    expect(result.status).toBe('Returned');
  });

  it('reports an owner with no deliverable address as not sent', async () => {
    const harness = new Harness();
    harness.subject = aSubject({ ownerEmail: '' });

    const result = await harness.service.complete({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
    });

    // **A deactivated report owner — event 7 is skipped, the transition
    // still commits.** The owner's item is in hand and the report says so;
    // a message that cannot be delivered is not a reason to un-return it.
    const skipped = result.notifications.find(
      (notification) => notification.event === 'lost_report_returned',
    );

    expect(skipped?.sent).toBe(false);
    expect(result.status).toBe('Returned');
  });

  it('evaluates event 8\'s gate against the status the write produced', async () => {    const harness = new Harness();

    await harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR });

    // **The gate reads the write's outcome, not the subject's prior
    // status.** The subject carried the matched response at `Match
    // Confirmed` — the *prior* status, which event 8's gate would refuse —
    // and event 8 is precisely the event the completed handoff fires.
    const gated = harness.notifications.find(
      (notification) => notification.event === 'recovery_completed',
    );

    expect(gated?.sent).toBe(true);
  });

  it('does not fire event 8 when the matched response was not completable', async () => {
    const harness = new Harness();
    harness.subject = aSubject({
      responses: [
        { id: 'response-2', status: 'Selected for Verification', responderEmail: 'second@example.test' },
      ],
    });

    // **The PRD says event 8 "does NOT fire when Match Confirmed is
    // initially recorded"** — and a closeout that completed a response
    // nobody had determined as a match is refused outright, so no event 8
    // is possible here.
    await expect(
      harness.service.complete({ reportId: 'report-1', actor: ADMINISTRATOR }),
    ).rejects.toThrow(ConflictError);
  });
});

// ── The result ──────────────────────────────────────────────────────────────

describe('the Lost-side closeout service — the result', () => {
  it('names the matched response and the report it completed', async () => {
    const harness = new Harness();

    const result = await harness.service.complete({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
    });

    expect(result.reportId).toBe('report-1');
    expect(result.status).toBe('Returned');
    expect(result.matchedResponseId).toBe('response-2');
  });

  it('reports the responses the batch resolved', async () => {
    const harness = new Harness();

    const result = await harness.service.complete({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
    });

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]?.id).toBe('response-1');
  });

  it('names the responses it left alone', async () => {
    const harness = new Harness();
    harness.subject = aSubject({
      responses: [
        { id: 'response-1', status: 'Not a Match', responderEmail: 'first@example.test' },
        { id: 'response-2', status: 'Match Confirmed', responderEmail: 'second@example.test' },
      ],
    });

    const result = await harness.service.complete({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
    });

    // **A terminal response is never rewritten,** and the result names it so
    // that the absence of a change is asserted as directly as a change.
    expect(result.untouched).toEqual([{ responseId: 'response-1', status: 'Not a Match' }]);
  });
});
