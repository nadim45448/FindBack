/**
 * The Recovery Response determination service's suite.
 *
 * **The two actors are kept apart, and that is asserted here.** The service
 * checks the recorder's authority and the maker's identity separately, and
 * the event's draft carries them in two different fields — so the trail can
 * answer who decided.
 *
 * **The maker is a server-side fact.** The service reads the report's owner
 * out of the database and compares the supplied maker against it. The test
 * that matters is the one where the request names someone else: the
 * determination is refused and nothing is written.
 *
 * **A confirmed match does not move the report.** That is asserted by the
 * *absence* of the report's move in the call sequence — the report's status
 * write happens only on the not-a-match path.
 *
 * **The email is sent after the commit, and its failure is not the
 * determination's failure.** A send that throws still leaves a successful
 * determination.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { RecoveryResponseDeterminationService } from '@/application/listings/recovery-response-determination-service';
import { DefaultRecoveryResponseDeterminationEmailBuilder } from '@/application/listings/recovery-response-determination-email';
import type {
  LostReportSubject,
  LostReportSubjectReader,
} from '@/application/listings/ports/lost-report-subject-reader';
import type {
  RecoveryResponseSelectionRepository,
} from '@/application/listings/ports/recovery-response-selection-repository';
import type {
  RecoveryResponseResponderReader,
} from '@/application/listings/ports/recovery-response-responder-reader';

import type { OutboundEmail, EmailSender } from '@/application/ports/email-sender';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';
import type { RecoveryResponseStatus } from '@/domain/recovery';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The administrator recording the determination. */
const ADMINISTRATOR = { actorId: 'admin-1', isAdministrator: true };

/** A recording fake of the ports plus the transaction factory. */
class Harness {
  readonly calls: Call[] = [];

  /** The Lost report, as the reader returns it. */
  report: LostReportSubject | null = {
    id: 'report-1',
    type: 'Lost',
    status: 'Verification Pending',
    reporterId: 'owner-1',
    name: 'Blue backpack',
    occurredAt: new Date('2026-10-30T09:00:00.000Z'),
  };

  /** The status of the response being determined. */
  responseStatus: RecoveryResponseStatus | null = 'Selected for Verification';

  /** Whether the conditional write lands. */
  determinationLands = true;

  /** The status the response was moved to. */
  movedTo: string | null = null;

  /** The report's move, as the reader recorded it. */
  reportMovedTo: string | null = null;

  /** The determination draft the event factory was given. */
  determinationDraft: {
    readonly determination: {
      readonly determinedByUserId: string;
      readonly recordedByAdministratorId: string;
    };
    readonly lostReportOwnerId: string;
    readonly outcome: string;
  } | null = null;

  /** The responder's address, as the reader returns it. */
  responder: { readonly email: string } | null = { email: 'responder@example.test' };

  /** Whether the email send throws. */
  emailFails = false;

  /** The emails the sender was asked to send. */
  readonly sent: OutboundEmail[] = [];

  readonly reports: LostReportSubjectReader = {
    readLostReport: async (): Promise<LostReportSubject | null> => {
      this.calls.push('reports.readLostReport');

      return this.report;
    },
    moveToVerificationPending: async (): Promise<boolean> => {
      throw new Error('moveToVerificationPending is not part of the determination path.');
    },
    moveToOpen: async (
      _reportId: string,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('reports.moveToOpen');
      this.assertHandle(transaction);
      this.reportMovedTo = 'Open';

      return true;
    },
  };

  readonly responses: RecoveryResponseSelectionRepository = {
    selectForVerification: async (): Promise<boolean> => {
      throw new Error('selectForVerification is not part of the determination path.');
    },
    determine: async (
      _responseId: string,
      status: RecoveryResponseStatus,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('responses.determine');
      this.assertHandle(transaction);

      if (this.determinationLands) {
        this.movedTo = status;
      }

      return this.determinationLands;
    },
    readSelectionFacts: async (): Promise<never> => {
      throw new Error('readSelectionFacts is not part of the determination path.');
    },
    readResponseStatus: async (): Promise<RecoveryResponseStatus | null> => {
      this.calls.push('responses.readResponseStatus');

      return this.responseStatus;
    },
  };

  readonly responders: RecoveryResponseResponderReader = {
    readResponder: async (): Promise<{ readonly email: string } | null> => {
      this.calls.push('responders.readResponder');

      return this.responder;
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The determination path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The determination path never reads the trail.');
    },
  });

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly emails: EmailSender = {
    send: async (message: OutboundEmail): Promise<void> => {
      this.calls.push('emails.send');
      this.sent.push(message);

      if (this.emailFails) {
        throw new Error('The SMTP transport failed.');
      }
    },
  };

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  /** The Lost-side event factory, stood in for by the audit writer. */
  readonly lostEvents = {
    recordDetermination: async (
      draft: {
        readonly determination: {
          readonly determinedByUserId: string;
          readonly recordedByAdministratorId: string;
        };
        readonly lostReportOwnerId: string;
        readonly outcome: string;
      },
      transaction: TransactionHandle,
    ): Promise<{ readonly id: string }> => {
      this.calls.push('events.recordDetermination');
      this.assertHandle(transaction);
      this.determinationDraft = draft;

      return { id: 'event-18' };
    },
    recordNotAMatchReturnToOpen: async (
      _draft: unknown,
      transaction: TransactionHandle,
    ): Promise<{ readonly id: string }> => {
      this.calls.push('events.recordNotAMatchReturnToOpen');
      this.assertHandle(transaction);

      return { id: 'event-28' };
    },
  };

  readonly service: RecoveryResponseDeterminationService =
    new RecoveryResponseDeterminationService(
      this.reports,
      this.responses,
      this.audit,
      this.transactions,
      this.lostEvents as never,
      this.emails,
      new DefaultRecoveryResponseDeterminationEmailBuilder(),
      this.responders,
    );

  /** Fail the test if a write was attempted without the caller's transaction. */
  assertHandle(transaction: TransactionHandle): void {
    if (transaction !== HANDLE) {
      throw new Error('A write was attempted outside the caller\'s transaction.');
    }
  }
}

describe('the determination service', () => {
  it('records a confirmed match, moves the response, and leaves the report alone', async () => {
    const harness = new Harness();

    const result = await harness.service.record({
      reportId: 'report-1',
      responseId: 'response-1',
      determinedByUserId: 'owner-1',
      outcome: 'match_confirmed',
      actor: ADMINISTRATOR,
    });

    expect(result.status).toBe('Match Confirmed');
    expect(result.reportStatus).toBe('Verification Pending');
    expect(result.eventId).toBe('event-18');

    // **A confirmed match does not move the report.** The physical return
    // has not been confirmed, so the workflow has not ended.
    expect(harness.reportMovedTo).toBeNull();
    expect(harness.calls).not.toContain('reports.moveToOpen');
    expect(harness.calls).not.toContain('events.recordNotAMatchReturnToOpen');
  });

  it('records a not-a-match, moves the response, and returns the report to Open', async () => {
    const harness = new Harness();

    const result = await harness.service.record({
      reportId: 'report-1',
      responseId: 'response-1',
      determinedByUserId: 'owner-1',
      outcome: 'not_a_match',
      actor: ADMINISTRATOR,
    });

    expect(result.status).toBe('Not a Match');
    expect(result.reportStatus).toBe('Open');
    expect(harness.reportMovedTo).toBe('Open');
    expect(harness.calls).toContain('events.recordNotAMatchReturnToOpen');
  });

  it('keeps the two actors in two different fields of the event', async () => {
    // **The distinction survives into the trail.** A trail that stored them
    // in one column could not answer who actually decided.
    const harness = new Harness();

    await harness.service.record({
      reportId: 'report-1',
      responseId: 'response-1',
      determinedByUserId: 'owner-1',
      outcome: 'match_confirmed',
      actor: ADMINISTRATOR,
    });

    expect(harness.determinationDraft?.determination).toEqual({
      determinedByUserId: 'owner-1',
      recordedByAdministratorId: 'admin-1',
    });
    expect(harness.determinationDraft?.lostReportOwnerId).toBe('owner-1');
  });

  it('refuses a recorder who is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.record({
        reportId: 'report-1',
        responseId: 'response-1',
        determinedByUserId: 'owner-1',
        outcome: 'match_confirmed',
        actor: { actorId: 'member-1', isAdministrator: false },
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a recording with no owner determination', async () => {
    // **A recording with no maker is the administrator deciding on their
    // own** — precisely what FR-43 forbids.
    const harness = new Harness();

    await expect(
      harness.service.record({
        reportId: 'report-1',
        responseId: 'response-1',
        determinedByUserId: null,
        outcome: 'match_confirmed',
        actor: ADMINISTRATOR,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a maker who is not the report owner', async () => {
    // **The maker is a server-side fact.** The service reads the report's
    // owner and compares — a client cannot name a different maker.
    const harness = new Harness();

    await expect(
      harness.service.record({
        reportId: 'report-1',
        responseId: 'response-1',
        determinedByUserId: 'someone-else',
        outcome: 'match_confirmed',
        actor: ADMINISTRATOR,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a response that is not awaiting determination', async () => {
    const harness = new Harness();
    harness.responseStatus = 'Submitted';

    await expect(
      harness.service.record({
        reportId: 'report-1',
        responseId: 'response-1',
        determinedByUserId: 'owner-1',
        outcome: 'match_confirmed',
        actor: ADMINISTRATOR,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses a response that does not exist on the report', async () => {
    const harness = new Harness();
    harness.responseStatus = null;

    await expect(
      harness.service.record({
        reportId: 'report-1',
        responseId: 'response-1',
        determinedByUserId: 'owner-1',
        outcome: 'match_confirmed',
        actor: ADMINISTRATOR,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses when a concurrent determination wins the race', async () => {
    // **The write is conditional on the response still being selected.**
    // Two administrators recording different determinations cannot both
    // land.
    const harness = new Harness();
    harness.determinationLands = false;

    await expect(
      harness.service.record({
        reportId: 'report-1',
        responseId: 'response-1',
        determinedByUserId: 'owner-1',
        outcome: 'match_confirmed',
        actor: ADMINISTRATOR,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(harness.calls).not.toContain('events.recordDetermination');
  });

  it('sends the email after the commit', async () => {
    const harness = new Harness();

    await harness.service.record({
      reportId: 'report-1',
      responseId: 'response-1',
      determinedByUserId: 'owner-1',
      outcome: 'match_confirmed',
      actor: ADMINISTRATOR,
    });

    // **The email is a consequence of the determination, not a part of
    // it.** It goes out after the transaction has committed.
    const commitIndex = harness.calls.indexOf('transactions.run');
    const emailIndex = harness.calls.indexOf('emails.send');

    expect(commitIndex).toBeGreaterThanOrEqual(0);
    expect(emailIndex).toBeGreaterThan(commitIndex);
  });

  it('succeeds when the email fails to send', async () => {
    // **A send failure never fails the determination.** The outcome is
    // already recorded and the trail is already written.
    const harness = new Harness();
    harness.emailFails = true;

    const result = await harness.service.record({
      reportId: 'report-1',
      responseId: 'response-1',
      determinedByUserId: 'owner-1',
      outcome: 'match_confirmed',
      actor: ADMINISTRATOR,
    });

    expect(result.status).toBe('Match Confirmed');
    expect(result.eventId).toBe('event-18');
  });

  it('notifies nobody when the response has no reachable responder', async () => {
    const harness = new Harness();
    harness.responder = null;

    const result = await harness.service.record({
      reportId: 'report-1',
      responseId: 'response-1',
      determinedByUserId: 'owner-1',
      outcome: 'match_confirmed',
      actor: ADMINISTRATOR,
    });

    expect(result.status).toBe('Match Confirmed');
    expect(harness.sent).toHaveLength(0);
  });
});
