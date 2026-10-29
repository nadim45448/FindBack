/**
 * The hard-delete service suite (FR-10).
 *
 * **The gate is the load-bearing part.** A hard delete removes the report
 * and its audit trail, so the conditions that permit it must hold exactly:
 * the report is `Open`, and it carries no interaction of the kind its type
 * makes relevant.
 *
 * **The audit trail goes with the report.** PRD §10 says the related audit
 * entries are removed with it, so the trail deletion and the row deletion
 * are one transaction — and the trail goes first, because the deletion
 * window is opened by the trail deletion.
 */

import { describe, expect, it } from 'vitest';

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

import { ReportDeletionService } from '@/application/listings/report-deletion-service';

import type { AuditTrailDeletion } from '@/application/listings/report-deletion-service';
import type { ReportInteractionReader } from '@/application/listings/ports/report-interaction-reader';
import type { ImageStore } from '@/application/listings/ports/image-store';
import type { ReportRepository } from '@/application/listings/ports/report-repository';

import type { InteractionFacts, PersistedReport } from '@/domain/listings';

import {
  aReport,
  aTransactionFactory,
  HANDLE,
  type Call,
} from './report-lifecycle-fixtures';

/** The options a service is built with. */
interface Options {
  readonly report?: PersistedReport | null;
  readonly facts?: InteractionFacts;
  readonly calls: Call[];
}

/** Build the service. */
function aService(options: Options): ReportDeletionService {
  const report = options.report === undefined ? aReport() : options.report;

  const reports: ReportRepository = {
    create: async (): Promise<never> => {
      throw new Error('create is not part of the delete path.');
    },
    findById: async (): Promise<PersistedReport | null> => report,
    update: async (): Promise<never> => {
      throw new Error('update is not part of the delete path.');
    },
    delete: async (reportId: string, transaction: unknown): Promise<void> => {
      if (transaction !== HANDLE) {
        throw new Error('The report was deleted outside the transaction.');
      }

      options.calls.push(`reports.delete:${reportId}`);
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
      throw new Error('Not used by the delete path.');
    },
    readNonTerminalRecoveryResponses: async (): Promise<never> => {
      throw new Error('Not used by the delete path.');
    },
  };

  const auditTrailDeletion: AuditTrailDeletion = {
    deleteForParent: async (
      parentType: string,
      parentId: string,
      transaction: unknown,
    ): Promise<number> => {
      if (transaction !== HANDLE) {
        throw new Error('The audit trail was deleted outside the transaction.');
      }

      options.calls.push(`audit.deleteForParent:${parentType}:${parentId}`);

      return 3;
    },
  };

  const images: ImageStore = {
    store: async (): Promise<never> => {
      throw new Error('store is not part of the delete path.');
    },
    delete: async (path: string): Promise<void> => {
      options.calls.push(`images.delete:${path}`);
    },
  };

  return new ReportDeletionService(
    reports,
    interactions,
    auditTrailDeletion,
    images,
    aTransactionFactory(options.calls),
    { recordBlobDeleteFailure: (): void => undefined },
  );
}

describe('ReportDeletionService', () => {
  it('refuses a report that does not exist', async () => {
    const calls: Call[] = [];
    const service = aService({ calls, report: null });

    await expect(
      service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a member who is not the reporter', async () => {
    const calls: Call[] = [];
    const service = aService({ calls });

    await expect(
      service.delete({ reportId: 'report-1', actor: { actorId: 'someone-else' } }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('deletes an interaction-free Open report', async () => {
    const calls: Call[] = [];
    const service = aService({ calls });

    const result = await service.delete({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
    });

    expect(result.report.id).toBe('report-1');
    expect(calls).toContain('reports.delete:report-1');
  });

  it('deletes the audit trail with the report, in the same transaction', async () => {
    const calls: Call[] = [];
    const service = aService({ calls });

    await service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(calls).toContain('audit.deleteForParent:report:report-1');
    expect(calls.indexOf('audit.deleteForParent:report:report-1')).toBeLessThan(
      calls.indexOf('reports.delete:report-1'),
    );
    expect(calls.indexOf('reports.delete:report-1')).toBeLessThan(
      calls.indexOf('transactions.commit'),
    );
  });

  it('refuses a Found report that has a Claim, with a message pointing at Withdraw', async () => {
    const calls: Call[] = [];
    const service = aService({
      calls,
      facts: {
        hasClaim: true,
        hasRecoveryResponse: false,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      },
    });

    await expect(
      service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toThrow(/withdraw/i);

    expect(calls).not.toContain('reports.delete:report-1');
    expect(calls).not.toContain('audit.deleteForParent:report:report-1');
  });

  it('refuses a Lost report that has a Recovery Response', async () => {
    const calls: Call[] = [];
    const service = aService({
      calls,
      report: aReport({ type: 'Lost' }),
      facts: {
        hasClaim: false,
        hasRecoveryResponse: true,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      },
    });

    await expect(
      service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('does not count a Claim against a Lost report', async () => {
    const calls: Call[] = [];
    const service = aService({
      calls,
      report: aReport({ type: 'Lost' }),
      facts: {
        hasClaim: true,
        hasRecoveryResponse: false,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      },
    });

    await service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(calls).toContain('reports.delete:report-1');
  });

  it('refuses a report that is not Open', async () => {
    const calls: Call[] = [];
    const service = aService({ calls, report: aReport({ status: 'Claim Requested' }) });

    await expect(
      service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(calls).not.toContain('reports.delete:report-1');
  });

  it('refuses a Returned report', async () => {
    const calls: Call[] = [];
    const service = aService({ calls, report: aReport({ status: 'Returned' }) });

    await expect(
      service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('never opens the audit deletion window for a report that fails the gate', async () => {
    const calls: Call[] = [];
    const service = aService({
      calls,
      facts: {
        hasClaim: true,
        hasRecoveryResponse: false,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      },
    });

    await expect(
      service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } }),
    ).rejects.toBeInstanceOf(ConflictError);

    // **The flag is opened only after the eligibility check has passed.**
    expect(calls).not.toContain('audit.deleteForParent:report:report-1');
    expect(calls).not.toContain('transactions.run');
  });

  it('deletes the image after the commit', async () => {
    const calls: Call[] = [];
    const service = aService({
      calls,
      report: aReport({ imageRef: { path: 'reports/image.jpg' } }),
    });

    await service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(calls).toContain('images.delete:reports/image.jpg');
    expect(calls.indexOf('transactions.commit')).toBeLessThan(
      calls.indexOf('images.delete:reports/image.jpg'),
    );
  });

  it('does not delete an image the report does not have', async () => {
    const calls: Call[] = [];
    const service = aService({ calls });

    await service.delete({ reportId: 'report-1', actor: { actorId: 'reporter-1' } });

    expect(calls.some((call) => call.startsWith('images.delete:'))).toBe(false);
  });
});
