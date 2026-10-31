/**
 * The Recovery Response selection service's suite.
 *
 * **The sequence is the mechanism, and the sequence is asserted here.** The
 * service reads the report, reads the selection facts, decides, and then —
 * inside one transaction — moves the response, moves the report, and writes
 * the two audit events. The order is what delivers the PRD's rule that a
 * selection, the report's move, and the trail commit together.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order, so the assertions are about the *orchestration* rather than
 * about a mock's return value. The race is simulated by making the
 * conditional write land nothing — which is exactly what the second owner's
 * transaction would see after the first's commit.
 *
 * **The already-selected no-op writes nothing.** That is asserted directly:
 * no transaction, no write, no event.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { RecoveryResponseSelectionService } from '@/application/listings/recovery-response-selection-service';
import type {
  LostReportSubject,
  LostReportSubjectReader,
} from '@/application/listings/ports/lost-report-subject-reader';
import type {
  RecoveryResponseSelectionFacts,
  RecoveryResponseSelectionRepository,
} from '@/application/listings/ports/recovery-response-selection-repository';

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

/** The owner making the selection. */
const OWNER = { actorId: 'owner-1', isAccountActive: true };

/** A recording fake of the ports plus the transaction factory. */
class Harness {
  readonly calls: Call[] = [];

  /** The Lost report, as the reader returns it. `null` means "no such report". */
  report: LostReportSubject | null = {
    id: 'report-1',
    type: 'Lost',
    status: 'Open',
    reporterId: 'owner-1',
    name: 'Blue backpack',
    occurredAt: new Date('2026-10-30T09:00:00.000Z'),
  };

  /** The report's selection facts. */
  facts: RecoveryResponseSelectionFacts | null = {
    selectedResponseId: null,
    selectedResponseStatus: null,
  };

  /** The status of the response being selected. */
  responseStatus: RecoveryResponseStatus | null = 'Submitted';

  /** Whether the conditional write lands. */
  selectionLands = true;

  /** The status the response was moved to. */
  movedTo: string | null = null;

  /** The report's move, as the reader recorded it. */
  reportMovedTo: string | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly reports: LostReportSubjectReader = {
    readLostReport: async (): Promise<LostReportSubject | null> => {
      this.calls.push('reports.readLostReport');

      return this.report;
    },
    moveToVerificationPending: async (
      _reportId: string,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('reports.moveToVerificationPending');
      this.assertHandle(transaction);
      this.reportMovedTo = 'Verification Pending';

      return true;
    },
    moveToOpen: async (): Promise<boolean> => {
      throw new Error('moveToOpen is not part of the selection path.');
    },
  };

  readonly responses: RecoveryResponseSelectionRepository = {
    selectForVerification: async (
      _responseId: string,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('responses.selectForVerification');
      this.assertHandle(transaction);

      if (this.selectionLands) {
        this.movedTo = 'Selected for Verification';
      }

      return this.selectionLands;
    },
    determine: async (): Promise<boolean> => {
      throw new Error('determine is not part of the selection path.');
    },
    readSelectionFacts: async (): Promise<RecoveryResponseSelectionFacts | null> => {
      this.calls.push('responses.readSelectionFacts');

      return this.facts;
    },
    readResponseStatus: async (): Promise<RecoveryResponseStatus | null> => {
      this.calls.push('responses.readResponseStatus');

      return this.responseStatus;
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The selection path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The selection path never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  /** The Lost-side event factory, stood in for by the audit writer. */
  readonly lostEvents = {
    recordSelectedForVerification: async (
      draft: { readonly ownerId: string },
      transaction: TransactionHandle,
    ): Promise<{ readonly id: string }> => {
      this.calls.push('events.recordSelectedForVerification');
      this.assertHandle(transaction);

      return { id: 'event-17' };
    },
    recordToVerificationPending: async (
      _draft: unknown,
      transaction: TransactionHandle,
    ): Promise<{ readonly id: string }> => {
      this.calls.push('events.recordToVerificationPending');
      this.assertHandle(transaction);

      return { id: 'event-29' };
    },
  };

  readonly service: RecoveryResponseSelectionService = new RecoveryResponseSelectionService(
    this.reports,
    this.responses,
    this.audit,
    this.transactions,
    this.lostEvents as never,
  );

  /** Fail the test if a write was attempted without the caller's transaction. */
  assertHandle(transaction: TransactionHandle): void {
    if (transaction !== HANDLE) {
      throw new Error('A write was attempted outside the caller\'s transaction.');
    }
  }
}

describe('the selection service', () => {
  it('moves the response and the report, and writes both events, in one transaction', async () => {
    const harness = new Harness();

    const result = await harness.service.select({
      reportId: 'report-1',
      responseId: 'response-1',
      actor: OWNER,
    });

    expect(result.changed).toBe(true);
    expect(result.status).toBe('Selected for Verification');
    expect(result.reportStatus).toBe('Verification Pending');
    expect(result.eventId).toBe('event-17');

    // **The order is the mechanism.** The response moves first, then the
    // report, then the two events — and all of it inside the transaction.
    expect(harness.calls).toEqual([
      'reports.readLostReport',
      'responses.readSelectionFacts',
      'responses.readResponseStatus',
      'transactions.run',
      'responses.selectForVerification',
      'reports.moveToVerificationPending',
      'events.recordSelectedForVerification',
      'events.recordToVerificationPending',
    ]);
  });

  it('writes nothing when the response is already selected', async () => {
    // **The idempotent no-op.** The owner clicking twice is a repeated
    // request for a state that already holds — not a mistake needing an
    // error message, and not a second audit entry.
    const harness = new Harness();
    harness.responseStatus = 'Selected for Verification';
    harness.facts = {
      selectedResponseId: 'response-1',
      selectedResponseStatus: 'Selected for Verification',
    };

    const result = await harness.service.select({
      reportId: 'report-1',
      responseId: 'response-1',
      actor: OWNER,
    });

    expect(result.changed).toBe(false);
    expect(result.eventId).toBe('');
    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.calls).not.toContain('responses.selectForVerification');
    expect(harness.calls).not.toContain('events.recordSelectedForVerification');
  });

  it('refuses an actor who is not the report owner', async () => {
    const harness = new Harness();

    await expect(
      harness.service.select({
        reportId: 'report-1',
        responseId: 'response-1',
        actor: { actorId: 'someone-else', isAccountActive: true },
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a report that does not exist', async () => {
    const harness = new Harness();
    harness.report = null;

    await expect(
      harness.service.select({
        reportId: 'report-1',
        responseId: 'response-1',
        actor: OWNER,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('refuses a report whose match has been confirmed', async () => {
    // **The lock is unconditional.** A settled outcome stops the workflow
    // whatever else the facts say.
    const harness = new Harness();
    harness.facts = {
      selectedResponseId: 'response-2',
      selectedResponseStatus: 'Match Confirmed',
    };

    await expect(
      harness.service.select({
        reportId: 'report-1',
        responseId: 'response-1',
        actor: OWNER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses a response that is not awaiting review', async () => {
    const harness = new Harness();
    harness.responseStatus = 'Withdrawn';

    await expect(
      harness.service.select({
        reportId: 'report-1',
        responseId: 'response-1',
        actor: OWNER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses a response that does not exist on the report', async () => {
    const harness = new Harness();
    harness.responseStatus = null;

    await expect(
      harness.service.select({
        reportId: 'report-1',
        responseId: 'response-1',
        actor: OWNER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses when the concurrent selection wins the race', async () => {
    // **The write is conditional on the response still being `Submitted`.**
    // A response decided between the read and the write is not selected.
    const harness = new Harness();
    harness.selectionLands = false;

    await expect(
      harness.service.select({
        reportId: 'report-1',
        responseId: 'response-1',
        actor: OWNER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // **Nothing else is written.** The transaction rolls back with the
    // conflict.
    expect(harness.calls).not.toContain('reports.moveToVerificationPending');
    expect(harness.calls).not.toContain('events.recordSelectedForVerification');
  });
});
