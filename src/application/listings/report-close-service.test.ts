/**
 * The report close service's suite.
 *
 * **The close is one act, and this suite proves that it is.** A Found
 * report that is `Closed` while a Claim on it is still `Pending` would be a
 * state the PRD forbids, and the only way to forbid it is to write the
 * report's status and the Claims' rejections **in one transaction**. The
 * harness records the order of the calls, so the assertions are about the
 * orchestration rather than about a mock's return value.
 *
 * **Four properties carry the service:**
 *
 * 1. **A close without a reason is refused, and nothing is written.** The
 *    reason is what the trail preserves, so it is validated before
 *    anything is read.
 * 2. **A member who is not an administrator is refused.** The flag comes
 *    from the session, never from the request body.
 * 3. **The Lost side is refused here.** FR-21's Lost-side closure resolves
 *    Recovery Responses, which is a different operation with a different
 *    trail.
 * 4. **The auto-rejections carry one event each, and the emails go to the
 *    claimants only.** Story 006 says "each auto-rejection is a distinct
 *    separate event rather than a single combined entry", and FR-29 says
 *    the rejection email is "Sent to the claimant only".
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import {
  ReportCloseService,
  ReportCloseRefusedError,
} from '@/application/listings/report-close-service';
import { DefaultClaimDecisionEmailBuilder } from '@/application/listings/claim-decision-email';
import type { ReportInteractionResolver, RejectedClaim } from '@/application/listings/ports/report-interaction-resolver';
import type { ReportRepository } from '@/application/listings/ports/report-repository';

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { OutboundEmail } from '@/application/ports/email-sender';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import {
  autoRejectionCopy,
  buildReportFoundClosedByAdministratorEvent,
  createReportDescription,
  createReportName,
  parseReportDate,
  type PersistedReport,
  type ReportStatus,
} from '@/domain/listings';

import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/lib/errors';

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The administrator who is closing. */
const ADMINISTRATOR = { actorId: 'admin-1', isAdministrator: true };

/** A member who is not an administrator. */
const MEMBER = { actorId: 'member-1', isAdministrator: false };

/** The administrator's reason. */
const REASON = 'This item was posted in error and has been removed.';

/**
 * Build a persisted report the fake repository returns.
 */
function aReport(overrides: Partial<PersistedReport> = {}): PersistedReport {
  return {
    id: 'report-1',
    type: 'Found',
    status: 'Claim Requested',
    name: createReportName('A canvas tote bag'),
    category: 'Bag',
    description: createReportDescription('A canvas tote bag with a university logo.'),
    date: parseReportDate('2026-10-28'),
    campusArea: { value: 'library' },
    exactPlace: null,
    identifyingDetails: null,
    imageRef: null,
    reporterId: 'finder-1',
    createdAt: new Date('2026-10-28T10:00:00.000Z'),
    updatedAt: new Date('2026-10-28T10:00:00.000Z'),
    ...overrides,
  };
}

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The report the repository returns. `null` means "no such report". */
  report: PersistedReport | null = aReport();

  /** The Claims the resolver rejected. */
  readonly rejected: RejectedClaim[] = [];

  /** The reason the resolver was given. */
  rejectionReason: string | null = null;

  /** The status the repository was asked to write. */
  writtenStatus: ReportStatus | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  /** The emails that were sent. */
  readonly emails: OutboundEmail[] = [];

  /** When the email transport fails. */
  emailFailure: Error | null = null;

  readonly reports: ReportRepository = {
    create: async () => {
      throw new Error('The close path never creates a report.');
    },
    findById: async (reportId: string): Promise<PersistedReport | null> => {
      this.calls.push('reports.findById');

      if (this.report === null || this.report.id !== reportId) {
        return null;
      }

      return this.report;
    },
    update: async (
      reportId: string,
      update: { readonly status?: ReportStatus },
      _transaction: TransactionHandle,
    ): Promise<PersistedReport> => {
      this.calls.push('reports.update');
      this.writtenStatus = update.status ?? null;

      return aReport({ id: reportId, status: 'Closed' });
    },
    delete: async () => {
      throw new Error('The close path never deletes a report.');
    },
  };

  readonly resolver: ReportInteractionResolver = {
    rejectPendingClaims: async (
      _reportId: string,
      reason: string,
      _transaction: TransactionHandle,
    ): Promise<readonly RejectedClaim[]> => {
      this.calls.push('resolver.rejectPendingClaims');
      this.rejectionReason = reason;

      return this.rejected;
    },
    resolveWithdrawalResolvedRecoveryResponses: async () => {
      throw new Error('The Found-side close never resolves a recovery response.');
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The close path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The close path never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly mailer = {
    send: async (message: OutboundEmail): Promise<void> => {
      this.calls.push('emails.send');
      this.emails.push(message);

      if (this.emailFailure !== null) {
        throw this.emailFailure;
      }
    },
  };

  readonly service: ReportCloseService = new ReportCloseService(
    this.reports,
    this.resolver,
    this.audit,
    this.transactions,
    { now: () => new Date('2026-10-30T12:00:00.000Z') },
    this.mailer,
    new DefaultClaimDecisionEmailBuilder(),
  );
}

// ── The reason ────────────────────────────────────────────────────────────

describe('the report close service — the reason', () => {
  it('refuses a close with no reason', async () => {
    const harness = new Harness();

    // **A close with no usable reason is refused before anything is read or
    // written.** The reason is what the trail preserves, and a trail entry
    // with no reason explains nothing.
    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a reason shorter than ten characters', async () => {
    const harness = new Harness();

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: 'Too short' }),
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

  it('refuses a whitespace-only reason', async () => {
    const harness = new Harness();

    await expect(
      harness.service.close({
        reportId: 'report-1',
        actor: ADMINISTRATOR,
        reason: '          ',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('writes nothing when the reason is refused', async () => {
    const harness = new Harness();

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: '' }),
    ).rejects.toThrow(ValidationError);

    // **The reason is checked first,** so not even the report is read.
    expect(harness.calls).toEqual([]);
    expect(harness.events).toEqual([]);
  });
});

// ── The authorisation ─────────────────────────────────────────────────────

describe('the report close service — the authorisation', () => {
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

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toEqual([]);
    expect(harness.emails).toEqual([]);
  });

  it('refuses a report that does not exist', async () => {
    const harness = new Harness();
    harness.report = null;

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses a lost report', async () => {
    const harness = new Harness();
    harness.report = aReport({ type: 'Lost', status: 'Verification Pending' });

    // **The Lost side is a different operation.** FR-21's Lost-side closure
    // resolves Recovery Responses and writes FR-48's events 24 or 25 —
    // closing a Lost report here would close it and leave its Responses
    // unresolved.
    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the report is a lost one', async () => {
    const harness = new Harness();
    harness.report = aReport({ type: 'Lost', status: 'Verification Pending' });

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toEqual([]);
  });
});

// ── The gate ──────────────────────────────────────────────────────────────

describe('the report close service — the gate', () => {
  it('refuses to close a report that is already returned', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Returned' });

    // **A terminal report is refused because the story says so.** The
    // refusal is a conflict, not a permission failure — the administrator
    // may close reports; this one is already ended.
    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ReportCloseRefusedError);
  });

  it('refuses to close a report that is already closed', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Closed' });

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ReportCloseRefusedError);
  });

  it('refuses a terminal report as a conflict, not a permission failure', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Closed' });

    // **The refusal answers with a 409,** because the report is already
    // ended — not with a 403, which would tell the administrator they may
    // not close reports at all.
    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ConflictError);
  });

  it('writes nothing when the report is terminal', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Closed' });

    await expect(
      harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON }),
    ).rejects.toThrow(ReportCloseRefusedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toEqual([]);
    expect(harness.emails).toEqual([]);
  });

  it('closes an open report', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Open' });

    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.status).toBe('Closed');
  });

  it('closes a report whose claim was approved', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Claim Approved' });

    // **The exceptional `Claim Approved → Closed` close is legal.** By that
    // point no Claim is `Pending` — the approved one is `Approved`, and it
    // stays `Approved` for historical accuracy.
    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.status).toBe('Closed');
    expect(result.autoRejected).toEqual([]);
  });
});

// ── The write ─────────────────────────────────────────────────────────────

describe('the report close service — the write', () => {
  it('writes the status as closed', async () => {
    const harness = new Harness();

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    expect(harness.writtenStatus).toBe('Closed');
  });

  it('does the status change and the claim rejections in one transaction', async () => {
    const harness = new Harness();
    harness.rejected.push({
      claimId: 'claim-1',
      claimStatus: 'Rejected',
      reason: 'report closed by administrator',
      claimantEmail: 'claimant@example.test',
    });

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    // **The order is the guarantee.** The Claims are rejected, the report's
    // status moves, and the events are recorded — all inside the one
    // transaction, so a report that is `Closed` while a Claim is still
    // `Pending` cannot exist. The email is **after** the transaction,
    // because it names a fact that is only true once the commit happened.
    expect(harness.calls).toEqual([
      'reports.findById',
      'transactions.run',
      'resolver.rejectPendingClaims',
      'reports.update',
      'audit.record',
      'audit.record',
      'emails.send',
    ]);
  });

  it('rejects the pending claims with the PRD\'s verbatim reason', async () => {
    const harness = new Harness();

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    // **The stored reason is the PRD's own wording,** because FR-17's
    // Trigger 3 names it exactly.
    expect(harness.rejectionReason).toBe('report closed by administrator');
  });

  it('records the close\'s own audit event', async () => {
    const harness = new Harness();

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    const close = harness.events.find(
      (event) => event.eventType === 'report.found_closed_by_administrator',
    );

    expect(close).toBeDefined();
    expect(close?.parentType).toBe('report');
    expect(close?.parentId).toBe('report-1');
    expect(close?.actorRole).toBe('administrator');
    expect(close?.actorId).toBe('admin-1');
  });

  it('records the previous status and the reason in the close\'s event', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Claim Requested' });

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    const close = harness.events.find(
      (event) => event.eventType === 'report.found_closed_by_administrator',
    );

    // **The payload carries exactly the catalog's two fields.**
    expect(close?.metadata).toEqual({
      previousFoundStatus: 'Claim Requested',
      closureReason: REASON,
    });
  });

  it('keeps the administrator\'s reason verbatim in the trail', async () => {
    const harness = new Harness();

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    const close = harness.events.find(
      (event) => event.eventType === 'report.found_closed_by_administrator',
    );

    // **The softening rule is about the auto-rejection's visible copy,** not
    // to an administrator's stated reason for closing a report.
    expect((close?.metadata as { closureReason: string }).closureReason).toBe(REASON);
  });

  it('records one auto-rejection event per rejected claim', async () => {
    const harness = new Harness();
    harness.rejected.push(
      {
        claimId: 'claim-1',
        claimStatus: 'Rejected',
        reason: 'report closed by administrator',
        claimantEmail: 'first@example.test',
      },
      {
        claimId: 'claim-2',
        claimStatus: 'Rejected',
        reason: 'report closed by administrator',
        claimantEmail: 'second@example.test',
      },
    );

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    const rejections = harness.events.filter(
      (event) => event.eventType === 'claim.auto_rejected',
    );

    // **Each auto-rejection is a distinct separate event,** not a single
    // combined entry — an administrator auditing one specific rejected
    // Claim must find it.
    expect(rejections).toHaveLength(2);
    expect(rejections.map((event) => event.parentId)).toEqual(['claim-1', 'claim-2']);
  });

  it('names the administrator who caused each auto-rejection', async () => {
    const harness = new Harness();
    harness.rejected.push({
      claimId: 'claim-1',
      claimStatus: 'Rejected',
      reason: 'report closed by administrator',
      claimantEmail: 'first@example.test',
    });

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    const rejection = harness.events.find(
      (event) => event.eventType === 'claim.auto_rejected',
    );

    // **The trigger's cause is named in the payload,** because the Claim's
    // own decider column stays null on an auto-rejection.
    expect((rejection?.metadata as { triggeredBy: string }).triggeredBy).toBe('admin-1');
  });

  it('reports the claims it auto-rejected', async () => {
    const harness = new Harness();
    harness.rejected.push({
      claimId: 'claim-1',
      claimStatus: 'Rejected',
      reason: 'report closed by administrator',
      claimantEmail: 'first@example.test',
    });

    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.autoRejected).toHaveLength(1);
    expect(result.autoRejected[0]?.claimId).toBe('claim-1');
    expect(result.autoRejected[0]?.claimantEmail).toBe('first@example.test');
    expect(result.autoRejected[0]?.event.type).toBe('claim.auto_rejected');
  });

  it('returns the report as it was, immediately before the close', async () => {
    const harness = new Harness();
    harness.report = aReport({ status: 'Claim Requested' });

    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    // **The report the result carries is the one before the close,** because
    // the close's event names the *previous* status — and the result is
    // what the route's client uses to refresh its view.
    expect(result.report.status).toBe('Claim Requested');
    expect(result.report.id).toBe('report-1');
  });

  it('builds the close\'s event the same way the domain does', async () => {
    const harness = new Harness();

    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    // **The service does not invent the event's shape.** It asks the domain
    // for it, and the domain is the single implementation point for the
    // catalog's payload.
    const expected = buildReportFoundClosedByAdministratorEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      previousStatus: 'Claim Requested',
      closureReason: { value: REASON },
    });

    expect(result.event.type).toBe(expected.type);
    expect(result.event.payload).toEqual(expected.payload);
  });
});

// ── The notifications ─────────────────────────────────────────────────────

describe('the report close service — the notifications', () => {
  it('sends one email to each auto-rejected claimant', async () => {
    const harness = new Harness();
    harness.rejected.push(
      {
        claimId: 'claim-1',
        claimStatus: 'Rejected',
        reason: 'report closed by administrator',
        claimantEmail: 'first@example.test',
      },
      {
        claimId: 'claim-2',
        claimStatus: 'Rejected',
        reason: 'report closed by administrator',
        claimantEmail: 'second@example.test',
      },
    );

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    expect(harness.emails.map((email) => email.to)).toEqual([
      'first@example.test',
      'second@example.test',
    ]);
  });

  it('sends no email to the finder', async () => {
    const harness = new Harness();
    harness.rejected.push({
      claimId: 'claim-1',
      claimStatus: 'Rejected',
      reason: 'report closed by administrator',
      claimantEmail: 'first@example.test',
    });

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    // **FR-29 says "Sent to the claimant only".** The finder learns of the
    // outcome through My Reports, not through an email.
    expect(harness.emails.map((email) => email.to)).not.toContain('finder-1');
  });

  it('sends no email when no claim was auto-rejected', async () => {
    const harness = new Harness();

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    expect(harness.emails).toEqual([]);
  });

  it('sends the softened copy, not the stored reason', async () => {
    const harness = new Harness();
    harness.rejected.push({
      claimId: 'claim-1',
      claimStatus: 'Rejected',
      reason: 'report closed by administrator',
      claimantEmail: 'first@example.test',
    });

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    const body = harness.emails[0]!.textBody;

    // **The stored reason is the trail's wording; the member reads this.**
    // The softening rule of story 006 applies to the auto-rejection's
    // visible copy — and only to that.
    expect(body).toContain(autoRejectionCopy('ReportClosedByAdministrator').body);
    expect(body).not.toContain('report closed by administrator');
  });

  it('sends the email after the transaction has committed', async () => {
    const harness = new Harness();
    harness.rejected.push({
      claimId: 'claim-1',
      claimStatus: 'Rejected',
      reason: 'report closed by administrator',
      claimantEmail: 'first@example.test',
    });

    await harness.service.close({ reportId: 'report-1', actor: ADMINISTRATOR, reason: REASON });

    // **The email is outside the transaction,** because the message names a
    // fact that is only true once the commit has happened.
    const runIndex = harness.calls.indexOf('transactions.run');
    const sendIndex = harness.calls.indexOf('emails.send');

    expect(runIndex).toBeGreaterThanOrEqual(0);
    expect(sendIndex).toBeGreaterThan(runIndex);
  });

  it('keeps the close when a send fails', async () => {
    const harness = new Harness();
    harness.emailFailure = new Error('The transport is down.');
    harness.rejected.push({
      claimId: 'claim-1',
      claimStatus: 'Rejected',
      reason: 'report closed by administrator',
      claimantEmail: 'first@example.test',
    });

    // **A send failure never fails the close.** The report is already
    // `Closed` and its Claims are already `Rejected`; the email is a
    // notification of a fact that is now true.
    const result = await harness.service.close({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      reason: REASON,
    });

    expect(result.status).toBe('Closed');
    expect(result.autoRejected).toHaveLength(1);
  });
});
