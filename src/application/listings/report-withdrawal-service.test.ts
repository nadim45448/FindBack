/**
 * The withdrawal service suite (FR-11).
 *
 * **The two sides differ in kind, and the suite proves it.** The Found side
 * rejects Pending Claims and sends each claimant the FR-29 rejection email;
 * the Lost side resolves non-terminal Recovery Responses and sends nothing
 * at all (FR-30).
 *
 * **The dependent resolutions are in the same transaction as the status
 * change.** A report that is `Closed` while its Claims are still `Pending`
 * would leave a claimant waiting on a claim that will never be decided — so
 * the sequence is asserted, not just the outcome.
 */

import { describe, expect, it } from 'vitest';

import { NotFoundError, PermissionDeniedError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';

import {
  ReportWithdrawalService,
  WithdrawalRefusedError,
} from '@/application/listings/report-withdrawal-service';

import type { ReportInteractionReader } from '@/application/listings/ports/report-interaction-reader';
import type {
  RejectedClaim,
  ReportInteractionResolver,
  ResolvedRecoveryResponse,
} from '@/application/listings/ports/report-interaction-resolver';
import type { ReportFieldUpdate, ReportRepository } from '@/application/listings/ports/report-repository';

import type { EmailSender, OutboundEmail } from '@/application/ports/email-sender';

import { ConflictError } from '@/lib/errors';

import type { InteractionFacts, PersistedReport } from '@/domain/listings';

import {
  aReport,
  anAuditEventRepository,
  anUpdatedReport,
  aTransactionFactory,
  HANDLE,
  NOW,
  type Call,
} from './report-lifecycle-fixtures';

/** The options a service is built with. */
interface Options {
  readonly report?: PersistedReport | null;
  readonly facts?: InteractionFacts;
  readonly calls: Call[];
}

/** Build the service. */
function aService(options: Options): {
  readonly service: ReportWithdrawalService;
  readonly sent: OutboundEmail[];
  readonly audit: ReturnType<typeof anAuditEventRepository>;
  readonly updates: ReportFieldUpdate[];
} {
  const report = options.report === undefined ? aReport() : options.report;
  const sent: OutboundEmail[] = [];
  const updates: ReportFieldUpdate[] = [];

  const reports: ReportRepository = {
    create: async (): Promise<never> => {
      throw new Error('create is not part of the withdrawal path.');
    },
    findById: async (): Promise<PersistedReport | null> => report,
    update: async (
      _reportId: string,
      update: ReportFieldUpdate,
      transaction: unknown,
    ): Promise<PersistedReport> => {
      if (transaction !== HANDLE) {
        throw new Error('The report was written outside the transaction.');
      }

      options.calls.push('reports.update');
      updates.push(update);

      return anUpdatedReport(report, { status: 'Closed', updatedAt: NOW });
    },
    delete: async (): Promise<never> => {
      throw new Error('delete is not part of the withdrawal path.');
    },
  };

  const interactions: ReportInteractionReader = {
    read: async (): Promise<InteractionFacts> => {
      options.calls.push('interactions.read');

      return options.facts ?? {
        hasClaim: false,
        hasRecoveryResponse: false,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      };
    },
    readPendingClaims: async (): Promise<never> => {
      throw new Error('Not used by the withdrawal path.');
    },
    readNonTerminalRecoveryResponses: async (): Promise<never> => {
      throw new Error('Not used by the withdrawal path.');
    },
  };

  const resolver: ReportInteractionResolver = {
    rejectPendingClaims: async (
      reportId: string,
      reason: string,
      transaction: unknown,
    ): Promise<readonly RejectedClaim[]> => {
      if (transaction !== HANDLE) {
        throw new Error('The Claims were rejected outside the transaction.');
      }

      options.calls.push(`resolver.rejectPendingClaims:${reportId}:${reason}`);

      return [
        {
          claimId: 'claim-1',
          claimStatus: 'Rejected',
          reason,
          claimantEmail: 'claimant@example.org',
        },
      ];
    },
    resolveNonTerminalRecoveryResponses: async (
      reportId: string,
      transaction: unknown,
    ): Promise<readonly ResolvedRecoveryResponse[]> => {
      if (transaction !== HANDLE) {
        throw new Error('The Responses were resolved outside the transaction.');
      }

      options.calls.push(`resolver.resolveNonTerminalRecoveryResponses:${reportId}`);

      return [
        {
          recoveryResponseId: 'rr-1',
          recoveryResponseStatus: 'Resolved — Report Closed',
        },
      ];
    },
  };

  const emails: EmailSender = {
    send: async (message: OutboundEmail): Promise<void> => {
      options.calls.push('emails.send');
      sent.push(message);
    },
  };

  const audit = anAuditEventRepository(options.calls);

  const service = new ReportWithdrawalService(
    reports,
    interactions,
    resolver,
    new AuditWriter(audit),
    aTransactionFactory(options.calls),
    { now: (): Date => NOW },
    emails,
    {
      build: (
        recipientEmail: string,
        claimId: string,
        reason: string,
      ): OutboundEmail => ({
        to: recipientEmail,
        subject: 'Your claim was not accepted',
        textBody: `Reason: ${reason}. Claim ${claimId}.`,
        htmlBody: `<p>Reason: ${reason}.</p>`,
      }),
    },
  );

  return { service, sent, audit, updates };
}

describe('ReportWithdrawalService — the gate', () => {
  it('refuses a report that does not exist', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: null });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a member who is not the reporter', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'someone-else' } }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('refuses to withdraw a Returned report', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Returned' }) });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(WithdrawalRefusedError);
  });

  it('refuses to withdraw a Closed report', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Closed' }) });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(WithdrawalRefusedError);
  });

  it('refuses with an error the transport maps to a 409', async () => {
    // **The refusal is a `ConflictError`,** because that is what the
    // transport maps to a 409. An error that is not one of the mapped kinds
    // falls through to the generic handler and becomes a 500 — telling the
    // member the request failed for an unknown reason rather than that their
    // report cannot be withdrawn yet.
    //
    // **This is the assertion that found the bug.** The live smoke test
    // returned a 500 for a second withdrawal, because the refusal extended
    // `Error` rather than `ConflictError`.
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Closed' }) });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses to withdraw a Claim Approved Found report', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Claim Approved' }) });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toThrow(/claim has been approved/i);
  });

  it('refuses to withdraw a Lost report whose Match Confirmed has been recorded', async () => {
    const calls: Call[] = [];
    const { service } = aService({
      calls,
      report: aReport({ type: 'Lost', status: 'Verification Pending' }),
      facts: {
        hasClaim: false,
        hasRecoveryResponse: true,
        hasApprovedClaim: false,
        hasMatchConfirmed: true,
      },
    });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toThrow(/matched/i);
  });

  it('writes nothing when the gate refuses', async () => {
    const calls: Call[] = [];
    const { service, updates } = aService({ calls, report: aReport({ status: 'Closed' }) });

    await expect(
      service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(WithdrawalRefusedError);

    expect(updates).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });
});

describe('ReportWithdrawalService — the Found side', () => {
  it('closes the report', async () => {
    const calls: Call[] = [];
    const { service, updates } = aService({ calls });

    const result = await service.withdraw({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
    });

    expect(result.status).toBe('Closed');
    expect(updates).toEqual([{ status: 'Closed' }]);
  });

  it('rejects the Pending Claims with FR-11\'s reason', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(calls).toContain(
      'resolver.rejectPendingClaims:report-1:report withdrawn by reporter',
    );
  });

  it('sends the FR-29 rejection email to each affected claimant', async () => {
    const calls: Call[] = [];
    const { service, sent } = aService({ calls });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('claimant@example.org');
    expect(sent[0]?.textBody).toContain('report withdrawn by reporter');
  });

  it('sends the email after the commit', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(calls.indexOf('transactions.commit')).toBeLessThan(calls.indexOf('emails.send'));
  });

  it('fires event 9 with previousFoundStatus', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({
      calls,
      report: aReport({ status: 'Claim Requested' }),
    });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(audit.written[0]?.eventType).toBe('report.found_withdrawn_by_reporter');
    expect(audit.written[0]?.payload).toEqual({ previousFoundStatus: 'Claim Requested' });
  });

  it('resolves the Claims and closes the report in one transaction', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(calls.indexOf('resolver.rejectPendingClaims:report-1:report withdrawn by reporter'))
      .toBeLessThan(calls.indexOf('reports.update'));
    expect(calls.indexOf('reports.update')).toBeLessThan(calls.indexOf('transactions.commit'));
  });
});

describe('ReportWithdrawalService — the Lost side', () => {
  it('closes the report and resolves the non-terminal Responses', async () => {
    const calls: Call[] = [];
    const { service, updates } = aService({
      calls,
      report: aReport({ type: 'Lost', status: 'Verification Pending' }),
    });

    const result = await service.withdraw({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
    });

    expect(result.status).toBe('Closed');
    expect(updates).toEqual([{ status: 'Closed' }]);
    expect(calls).toContain('resolver.resolveNonTerminalRecoveryResponses:report-1');
  });

  it('sends no email — FR-30 says no closure email to responders', async () => {
    const calls: Call[] = [];
    const { service, sent } = aService({
      calls,
      report: aReport({ type: 'Lost', status: 'Verification Pending' }),
    });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(sent).toEqual([]);
    expect(calls).not.toContain('emails.send');
  });

  it('does not reject Claims', async () => {
    const calls: Call[] = [];
    const { service } = aService({
      calls,
      report: aReport({ type: 'Lost', status: 'Verification Pending' }),
    });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(
      calls.some((call) => call.startsWith('resolver.rejectPendingClaims:')),
    ).toBe(false);
  });

  it('fires event 23 with previousLostStatus', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({
      calls,
      report: aReport({ type: 'Lost', status: 'Verification Pending' }),
    });

    await service.withdraw({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(audit.written[0]?.eventType).toBe('report.lost_withdrawn_by_reporter');
    expect(audit.written[0]?.payload).toEqual({
      previousLostStatus: 'Verification Pending',
    });
  });
});
