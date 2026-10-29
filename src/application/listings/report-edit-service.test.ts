/**
 * The reporter's edit service suite (FR-9, FR-19).
 *
 * **The sequence is the mechanism, so the sequence is what is asserted.**
 * The audit event is written *inside* the transaction, and the write and the
 * event commit together or not at all.
 *
 * **FR-19's two halves are the load-bearing assertions.** Before an
 * interaction the event carries the changed fields alone; after one it
 * carries them and the previous values. The "after" case is the one that
 * makes silent evidence mutation impossible.
 */

import { describe, expect, it } from 'vitest';

import { NotFoundError, PermissionDeniedError } from '@/lib/errors';
import { ValidationError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';

import { ReportEditService } from '@/application/listings/report-edit-service';

import type { CampusAreaReader } from '@/application/listings/ports/campus-area-reader';
import type { ReportInteractionReader } from '@/application/listings/ports/report-interaction-reader';
import type { ReportFieldUpdate, ReportRepository } from '@/application/listings/ports/report-repository';

import type { InteractionFacts, PersistedReport } from '@/domain/listings';

import {
  aReport,
  anAuditEventRepository,
  anUpdatedReport,
  AREAS,
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

/** Build the service, and the update it received. */
function aService(options: Options): {
  readonly service: ReportEditService;
  readonly written: ReportFieldUpdate[];
  readonly audit: ReturnType<typeof anAuditEventRepository>;
} {
  const report = options.report === undefined ? aReport() : options.report;
  const written: ReportFieldUpdate[] = [];

  const reports: ReportRepository = {
    create: async (): Promise<never> => {
      throw new Error('create is not part of the edit path.');
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
      written.push(update);

      return anUpdatedReport(report, { updatedAt: NOW });
    },
    delete: async (): Promise<void> => {
      throw new Error('delete is not part of the edit path.');
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
      throw new Error('Not used by the edit path.');
    },
    readNonTerminalRecoveryResponses: async (): Promise<never> => {
      throw new Error('Not used by the edit path.');
    },
  };

  const campusAreas: CampusAreaReader = {
    listActive: async (): Promise<readonly (typeof AREAS)[number][]> => {
      options.calls.push('areas.listActive');

      return AREAS;
    },
  };

  const audit = anAuditEventRepository(options.calls);

  const service = new ReportEditService(
    reports,
    interactions,
    new AuditWriter(audit),
    aTransactionFactory(options.calls),
    { now: (): Date => NOW },
    campusAreas,
  );

  return { service, written, audit };
}

describe('ReportEditService', () => {
  it('refuses a report that does not exist', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: null });

    await expect(
      service.edit({ reportId: 'report-1', actor: { actorId: 'reporter-1' }, changes: {} }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a member who is not the reporter', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'someone-else' },
        changes: { name: 'New name' },
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('refuses to edit a Returned report, with the PRD\'s message', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Returned' }) });

    await expect(
      service.edit({ reportId: 'report-1', actor: { actorId: 'reporter-1' }, changes: { name: 'X' } }),
    ).rejects.toThrow('Returned reports cannot be edited.');
  });

  it('refuses to edit a Closed report, with the PRD\'s message', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Closed' }) });

    await expect(
      service.edit({ reportId: 'report-1', actor: { actorId: 'reporter-1' }, changes: { name: 'X' } }),
    ).rejects.toThrow('Closed reports cannot be edited.');
  });

  it('refuses an invalid submission and writes nothing', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'reporter-1' },
        changes: { name: '' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
    expect(calls).not.toContain('audit.append');
  });

  it('refuses a field that is not on the whitelist', async () => {
    // **A field that is neither on the list nor on the blocklist is
    // refused, not ignored.** The route's parser drops an unknown key, so
    // this is the second line of defence — but it is the line that makes the
    // service safe when it is called directly. A silently dropped field is
    // a lie about what was changed.
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'reporter-1' },
        changes: { somethingElse: 'value' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });

  it('refuses a change to the status', async () => {
    // **The edit never changes the status — FR-9 says so.** Here that is a
    // refusal, not a structural fact: the caller is told, rather than the
    // change being quietly discarded.
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'reporter-1' },
        changes: { status: 'Closed' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });

  it('refuses a change to the reporter', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'reporter-1' },
        changes: { reporterId: 'someone-else' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
  });

  it('names the offending field in the refusal', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'reporter-1' },
        changes: { status: 'Closed' } as never,
      }),
    ).rejects.toThrow(/status/);
  });

  it('writes only the changed fields', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'New name', description: 'A newer description of the wallet.' },
    });

    expect(written).toEqual([
      { name: 'New name', description: 'A newer description of the wallet.' },
    ]);
  });

  it('does not write a field whose value did not change', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'Brown leather wallet' },
    });

    expect(written).toEqual([]);
  });

  it('reports an unchanged edit as Unchanged and writes no record', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({ calls });

    const result = await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'Brown leather wallet' },
    });

    expect(result.outcome).toEqual({ kind: 'Unchanged' });
    expect(result.event).toBeNull();
    expect(audit.written).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });

  it('writes the audit event inside the transaction, before the commit', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'New name' },
    });

    expect(calls).toContain('reports.update');
    expect(calls.indexOf('audit.append')).toBeGreaterThan(calls.indexOf('reports.update'));
    expect(calls.indexOf('audit.append')).toBeLessThan(calls.indexOf('transactions.commit'));
  });

  it('fires event 8 with the changed fields alone before an interaction', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'New name' },
    });

    expect(audit.written).toHaveLength(1);
    expect(audit.written[0]?.eventType).toBe('report.edited_by_reporter');
    expect(audit.written[0]?.actorId).toBe('reporter-1');
    expect(audit.written[0]?.actorRole).toBe('member');
    expect(audit.written[0]?.payload).toEqual({
      changedFieldsSnapshot: { kind: 'FieldsOnly', fields: ['name'] },
    });
  });

  it('fires event 8 with the previous values once the report carries an interaction', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({
      calls,
      facts: {
        hasClaim: true,
        hasRecoveryResponse: false,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      },
    });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'New name' },
    });

    expect(audit.written[0]?.payload).toEqual({
      changedFieldsSnapshot: {
        kind: 'FieldsWithPreviousValues',
        fields: ['name'],
        previousValues: { name: 'Brown leather wallet' },
      },
    });
  });

  it('carries the previous values for a Lost report that has a Recovery Response', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({
      calls,
      report: aReport({ type: 'Lost' }),
      facts: {
        hasClaim: false,
        hasRecoveryResponse: true,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      },
    });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'New name' },
    });

    const payload = audit.written[0]?.payload;
    const snapshot = payload?.['changedFieldsSnapshot'] as
      | { readonly kind: string }
      | undefined;

    expect(snapshot?.kind).toBe('FieldsWithPreviousValues');
  });

  it('does not read the interactions when nothing changed', async () => {
    // **An unchanged edit writes nothing, so it has nothing to record — and
    // there is no interaction to condition on.**
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'reporter-1' },
      changes: { name: 'Brown leather wallet' },
    });

    expect(calls).not.toContain('interactions.read');
  });

  it('never changes the status', async () => {
    // **The refusal is stronger than the silence it replaced.** The edit
    // path used to drop a `status` from the change set and carry on, which
    // left the caller believing the status had been changed when it had
    // not. Now the submission is refused outright, and nothing is written.
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'reporter-1' },
        changes: { name: 'New name', status: 'Closed' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
    expect(calls).not.toContain('audit.append');
  });
});
