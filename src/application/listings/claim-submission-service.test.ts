/**
 * The Claim submission service's suite.
 *
 * **The sequence is the mechanism, and the sequence is asserted here.** The
 * service reads the report, decides the gate, validates the three fields,
 * then writes the Claim, the report's status, and the audit event in one
 * transaction — and only then sends the email. The order is what delivers
 * the PRD's rule that a refused submission writes nothing, and that the
 * email is never sent from inside the transaction.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order, so the assertions are about the *orchestration* rather than
 * about a mock's return value.
 */

import { describe, expect, it } from 'vitest';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';
import {
  ClaimSubmissionRefusedError,
  ClaimSubmissionService,
  type ClaimSubject,
  type ClaimSubjectReader,
} from '@/application/listings/claim-submission-service';
import { DefaultNewClaimEmailBuilder } from '@/application/listings/new-claim-email';
import type { ClaimRepository } from '@/application/listings/ports/claim-repository';
import type { PendingClaimReader } from '@/application/listings/ports/pending-claim-reader';
import type { ReportRepository } from '@/application/listings/ports/report-repository';

import type { EmailSender } from '@/application/ports/email-sender';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { OutboundEmail } from '@/application/ports/email-sender';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import type { ClaimDraft, PersistedClaim, PersistedReport, ValidatedClaim } from '@/domain/listings';

import { aReport } from './report-lifecycle-fixtures';

/** The order the calls happened in. */
type Call = string;

/** A fixed instant. */
const NOW = new Date('2026-10-29T12:00:00.000Z');

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** A reason that satisfies the 20–1000 bound. */
const REASON = 'It is my brown leather wallet.';

/** Identifying details that satisfy the 10–500 bound. */
const DETAILS = 'Blue cardholder with a dent.';

/** The subject the reader returns by default. */
const SUBJECT: ClaimSubject = {
  id: 'report-1',
  type: 'Found',
  status: 'Open',
  reporterId: 'the-finder',
  reporterEmail: 'finder@example.test',
  name: 'Brown wallet',
};

/** The report the fake repository returns from its update. */
const REPORT_FIXTURE: PersistedReport = aReport();

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The subject the reader returns. `null` means "no such report". */
  subject: ClaimSubject | null = SUBJECT;

  /** Whether the member already has a pending claim. */
  hasPendingClaim = false;

  /** The validated claim the repository was given. */
  received: ValidatedClaim | null = null;

  /** The transaction handle the repository was given, if any. */
  claimHandle: TransactionHandle | null = null;

  /** The transaction handle the report update was given, if any. */
  reportHandle: TransactionHandle | null = null;

  /** The report update the service issued. */
  reportUpdate: { status?: string } | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  /** The emails the sender was asked to send. */
  readonly sent: OutboundEmail[] = [];

  /** When the email send fails, with this message. */
  emailFailure: string | null = null;

  readonly subjects: ClaimSubjectReader = {
    readSubject: async (): Promise<ClaimSubject | null> => {
      this.calls.push('subjects.readSubject');

      return this.subject;
    },
  };

  readonly pendingClaims: PendingClaimReader = {
    hasPendingClaim: async (): Promise<boolean> => {
      this.calls.push('pendingClaims.hasPendingClaim');

      return this.hasPendingClaim;
    },
  };

  readonly claims: ClaimRepository = {
    create: async (claim: ValidatedClaim, transaction: TransactionHandle): Promise<PersistedClaim> => {
      this.calls.push('claims.create');
      this.received = claim;
      this.claimHandle = transaction;

      return { ...claim, id: 'claim-1' };
    },
    findById: async (): Promise<PersistedClaim | null> => {
      throw new Error('findById is not part of the submission path.');
    },
  };

  readonly reports: ReportRepository = {
    create: async (): Promise<never> => {
      throw new Error('create is not part of the submission path.');
    },
    findById: async (): Promise<never> => {
      throw new Error('findById is not part of the submission path.');
    },
    // **The update resolves; the service discards its result.** The write
    // is what matters — that it happened, and that it happened inside the
    // caller's transaction — so the fake returns a report and the service
    // ignores it.
    update: async (
      _reportId: string,
      update: { status?: string },
      transaction: TransactionHandle,
    ): Promise<PersistedReport> => {
      this.calls.push('reports.update');
      this.reportUpdate = update;
      this.reportHandle = transaction;

      return REPORT_FIXTURE;
    },
    delete: async (): Promise<void> => {
      throw new Error('delete is not part of the submission path.');
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      // **The writer hands back the persisted event.** The fake returns the
      // record it was given — the write path under test never reads the
      // returned event's own fields.
      return event as unknown as AuditEvent;
    },
    // The submission path never reads the trail, so a read here is a bug
    // rather than an unimplemented capability.
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The submission path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The submission path never reads the trail.');
    },
  });

  readonly emails: EmailSender = {
    send: async (message: OutboundEmail): Promise<void> => {
      this.calls.push('emails.send');
      this.sent.push(message);

      if (this.emailFailure !== null) {
        throw new Error(this.emailFailure);
      }
    },
  };

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly clock = { now: (): Date => NOW };

  readonly service: ClaimSubmissionService = new ClaimSubmissionService(
    this.claims,
    this.reports,
    this.subjects,
    this.pendingClaims,
    this.audit,
    this.transactions,
    this.clock,
    this.emails,
    new DefaultNewClaimEmailBuilder(),
    'https://findback.test',
  );
}

/** The draft the harness submits. */
function draft(overrides: Partial<ClaimDraft> = {}): ClaimDraft {
  return {
    reportId: 'report-1',
    reason: REASON,
    identifyingDetails: DETAILS,
    dateLost: '2026-10-20',
    ...overrides,
  };
}

/** The actor the harness submits as. */
const ACTOR = { actorId: 'the-claimant', isAccountActive: true };

describe('the claim submission service', () => {
  it('creates a Pending claim linked to the report', async () => {
    const harness = new Harness();

    const result = await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(result.claim.status).toBe('Pending');
    expect(result.claim.reportId).toBe('report-1');
    expect(result.claim.claimantId).toBe('the-claimant');
  });

  it('moves an Open report to Claim Requested', async () => {
    const harness = new Harness();

    const result = await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.reportUpdate).toEqual({ status: 'Claim Requested' });
    expect(result.reportStatus).toBe('Claim Requested');
  });

  it('leaves a report that is already at Claim Requested alone', async () => {
    // A second member's claim is legitimate, and the status it already
    // carries is the right one. Moving it again would write a transition
    // that did not happen.
    const harness = new Harness();
    harness.subject = { ...SUBJECT, status: 'Claim Requested' };

    const result = await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.reportUpdate).toBeNull();
    expect(result.reportStatus).toBe('Claim Requested');
  });

  it('writes the claim, the report status, and the audit event in one transaction', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    // The Claim and the report's status change carry the **same** handle.
    expect(harness.claimHandle).toBe(HANDLE);
    expect(harness.reportHandle).toBe(HANDLE);
    expect(harness.calls).toContain('transactions.run');
  });

  it('records the claim.submitted audit event with the three catalogued fields', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.eventType).toBe('claim.submitted');
    expect(harness.events[0]?.eventNumber).toBe(2);
    expect(harness.events[0]?.metadata).toMatchObject({
      reason: REASON,
      identifyingDetails: DETAILS,
      dateLost: '2026-10-20',
    });
  });

  it('records the claimant as the actor and the report as the parent', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.events[0]?.actorId).toBe('the-claimant');
    expect(harness.events[0]?.parentType).toBe('report');
    expect(harness.events[0]?.parentId).toBe('report-1');
  });

  it('sends the new-claim email to the finder after the commit', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]?.to).toBe('finder@example.test');
  });

  it('sends the email after the transaction, never inside it', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    const transactionIndex = harness.calls.indexOf('transactions.run');
    const emailIndex = harness.calls.indexOf('emails.send');

    expect(emailIndex).toBeGreaterThan(transactionIndex);
  });

  it('never carries the claimant\'s reason or identifying details in the email', async () => {
    // FR-39 and UJ-2: the finder is told that a claim exists and nothing
    // more. The builder has no way to receive them, so the message cannot
    // carry them.
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    const message = harness.sent[0];

    expect(message?.textBody).not.toContain(REASON);
    expect(message?.htmlBody).not.toContain(REASON);
    expect(message?.textBody).not.toContain(DETAILS);
    expect(message?.htmlBody).not.toContain(DETAILS);
  });

  it('names the item in the email', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.sent[0]?.textBody).toContain('Brown wallet');
  });

  it('links to the claim in the email', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.sent[0]?.textBody).toContain('https://findback.test/claims/claim-1');
  });

  it('lets a send failure pass without failing the submission', async () => {
    // The Claim is already Pending and the report is already Claim
    // Requested; the email only tells the finder about a fact that is now
    // true.
    const harness = new Harness();
    harness.emailFailure = 'The SMTP server is unreachable.';

    const result = await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(result.claim.status).toBe('Pending');
    expect(result.reportStatus).toBe('Claim Requested');
  });
});

describe('the claim submission refusals', () => {
  it('refuses a claim on a report that does not exist, and writes nothing', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      PermissionDeniedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses a claim from a member whose account is not active', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({
        draft: draft(),
        actor: { actorId: 'the-claimant', isAccountActive: false },
      }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a member claiming their own report, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({
        draft: draft(),
        actor: { actorId: 'the-finder', isAccountActive: true },
      }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses a second pending claim from the same member', async () => {
    const harness = new Harness();
    harness.hasPendingClaim = true;

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      ClaimSubmissionRefusedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('answers a duplicate with a conflict, not a permission failure', async () => {
    // The member must wait for the existing claim to be decided. That is a
    // conflict with an existing state, and the transport maps it to a 409.
    const harness = new Harness();
    harness.hasPendingClaim = true;

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      ConflictError,
    );
  });

  it('refuses a claim on a closed report, and writes nothing', async () => {
    const harness = new Harness();
    harness.subject = { ...SUBJECT, status: 'Closed' };

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      PermissionDeniedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });
});

describe('the claim submission validation', () => {
  it('refuses a reason that is too short, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({ draft: draft({ reason: 'too short' }), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses identifying details that are too short, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({ draft: draft({ identifyingDetails: 'short' }), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a date lost more than 365 days ago, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({ draft: draft({ dateLost: '2025-10-28' }), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a date lost in the future, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({ draft: draft({ dateLost: '2026-10-30' }), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('names the offending field in the validation error', async () => {
    const harness = new Harness();

    try {
      await harness.service.submit({ draft: draft({ reason: 'too short' }), actor: ACTOR });
      expect.unreachable('The submission should have been refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('reason');
    }
  });

  it('accepts a date lost exactly 365 days ago, because the bound is inclusive', async () => {
    const harness = new Harness();

    const result = await harness.service.submit({
      draft: draft({ dateLost: '2025-10-29' }),
      actor: ACTOR,
    });

    expect(result.claim.status).toBe('Pending');
  });
});
