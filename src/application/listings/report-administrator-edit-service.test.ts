/**
 * The administrator's edit service suite (FR-53).
 *
 * **The administrator's edit is narrow, and the suite proves the narrowness.**
 * FR-53 names exactly what may change and exactly what may not, and the
 * whitelist is enforced as a whitelist — a field that is neither on the list
 * nor on the blocklist is refused rather than silently ignored, because a
 * silently ignored field is a lie about what was changed.
 *
 * **The previous values are unconditional.** FR-53 says the record carries
 * "the changed fields, and the previous values" — there is no interaction
 * condition, unlike FR-19's reporter-side rule. That asymmetry is the whole
 * reason the two edit services are separate services.
 *
 * **The image is replaced, never overwritten.** The new blob is uploaded
 * first; the report then points at the new path; and only after the commit is
 * the old blob deleted. A blob store cannot join a PostgreSQL transaction, so
 * the write is compensating — the sequence is asserted, not just the outcome.
 */

import { describe, expect, it } from 'vitest';

import { NotFoundError, TerminalStateError, ValidationError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';

import { ReportAdministratorEditService } from '@/application/listings/report-administrator-edit-service';

import type { CampusAreaReader } from '@/application/listings/ports/campus-area-reader';
import type { ImageStore, ImageUpload } from '@/application/listings/ports/image-store';
import type { ReportFieldUpdate, ReportRepository } from '@/application/listings/ports/report-repository';

import type { PersistedReport } from '@/domain/listings';

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
  readonly calls: Call[];
  /** Make the row write fail, to exercise the compensating image delete. */
  readonly writeFails?: boolean;
  /** Make the blob store fail. */
  readonly storeFails?: boolean;
}

/** The built service and what it was given. */
interface Built {
  readonly service: ReportAdministratorEditService;
  readonly written: ReportFieldUpdate[];
  readonly audit: ReturnType<typeof anAuditEventRepository>;
  readonly stored: ImageUpload[];
  readonly deleted: string[];
}

/** Build the service. */
function aService(options: Options): Built {
  const report = options.report === undefined ? aReport() : options.report;
  const written: ReportFieldUpdate[] = [];
  const stored: ImageUpload[] = [];
  const deleted: string[] = [];

  const reports: ReportRepository = {
    create: async (): Promise<never> => {
      throw new Error('create is not part of the administrator edit path.');
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

      if (options.writeFails) {
        throw new Error('The row write failed.');
      }

      return anUpdatedReport(report, { updatedAt: NOW });
    },
    delete: async (): Promise<never> => {
      throw new Error('delete is not part of the administrator edit path.');
    },
  };

  const campusAreas: CampusAreaReader = {
    listActive: async (): Promise<readonly (typeof AREAS)[number][]> => {
      options.calls.push('areas.listActive');

      return AREAS;
    },
  };

  const images: ImageStore = {
    store: async (upload: ImageUpload, prefix: string): Promise<{ readonly path: string }> => {
      options.calls.push(`images.store:${prefix}`);
      stored.push(upload);

      if (options.storeFails) {
        throw new Error('The blob store failed.');
      }

      return { path: 'reports/new-image.jpg' };
    },
    delete: async (path: string): Promise<void> => {
      options.calls.push(`images.delete:${path}`);
      deleted.push(path);
    },
  };

  const audit = anAuditEventRepository(options.calls);

  const service = new ReportAdministratorEditService(
    reports,
    campusAreas,
    images,
    new AuditWriter(audit),
    aTransactionFactory(options.calls),
    { now: (): Date => NOW },
  );

  return { service, written, audit, stored, deleted };
}

/** An image upload, for a test that replaces one. */
function anImage(): ImageUpload {
  return { bytes: Buffer.from('bytes'), contentType: 'image/jpeg' };
}

describe('ReportAdministratorEditService — the gate', () => {
  it('refuses a report that does not exist', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: null });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { name: 'New name' },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to edit a Returned report', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Returned' }) });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { name: 'New name' },
      }),
    ).rejects.toBeInstanceOf(TerminalStateError);
  });

  it('refuses to edit a Closed report', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls, report: aReport({ status: 'Closed' }) });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { name: 'New name' },
      }),
    ).rejects.toBeInstanceOf(TerminalStateError);
  });

  it('checks the terminal status before the whitelist', async () => {
    // **The order matters.** A Closed report is uneditable by anyone, for any
    // reason — so the status check runs first and the offending field is never
    // even considered.
    const calls: Call[] = [];
    const { service, written } = aService({ calls, report: aReport({ status: 'Closed' }) });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { status: 'Open' } as never,
      }),
    ).rejects.toBeInstanceOf(TerminalStateError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });

  it('refuses a field that is not on the whitelist', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { status: 'Open' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });

  it('refuses a change to the report type', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { type: 'Lost' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a change to the reporter', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { reporterId: 'someone-else' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses an image replacement offered as a change key', async () => {
    // **The image arrives as its own request member, not as a change key.**
    // `imageReplacement` is on the administrator's editable set, but it names
    // an *operation* rather than a column — so as a change key it is not a
    // content field, and the change set is the content set.
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { imageReplacement: 'reports/new.jpg' } as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });

  it('names the offending field in the refusal', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { status: 'Open' } as never,
      }),
    ).rejects.toThrow(/status/);
  });

  it('refuses an invalid submission and writes nothing', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { name: '' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(written).toEqual([]);
    expect(calls).not.toContain('reports.update');
    expect(calls).not.toContain('audit.append');
  });
});

describe('ReportAdministratorEditService — the write', () => {
  it('writes only the changed fields', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
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
      actor: { actorId: 'admin-1' },
      changes: { name: 'Brown leather wallet' },
    });

    expect(written).toEqual([]);
  });

  it('reports an unchanged edit as Unchanged and writes no record', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({ calls });

    const result = await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: { name: 'Brown leather wallet' },
    });

    expect(result.outcome).toEqual({ kind: 'Unchanged' });
    expect(result.event).toBeNull();
    expect(audit.written).toEqual([]);
    expect(calls).not.toContain('reports.update');
  });

  it('never changes the status', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: { name: 'New name' },
    });

    expect(written[0]).not.toHaveProperty('status');
  });

  it('writes the audit record inside the transaction, before the commit', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: { name: 'New name' },
    });

    expect(calls).toContain('reports.update');
    expect(calls.indexOf('audit.append')).toBeGreaterThan(calls.indexOf('reports.update'));
    expect(calls.indexOf('audit.append')).toBeLessThan(calls.indexOf('transactions.commit'));
  });
});

describe('ReportAdministratorEditService — the audit record', () => {
  it('writes the non-numbered administrator record', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: { name: 'New name' },
    });

    expect(audit.written).toHaveLength(1);
    expect(audit.written[0]?.eventType).toBe('report.edited_by_administrator');
    expect(audit.written[0]?.actorId).toBe('admin-1');
    expect(audit.written[0]?.actorRole).toBe('administrator');
  });

  it('carries the changed fields and the previous values', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: { name: 'New name' },
    });

    expect(audit.written[0]?.payload).toEqual({
      changedFields: { fields: ['name'] },
      previousValues: { name: 'Brown leather wallet' },
    });
  });

  it('carries the previous values even when the report has no interaction', async () => {
    // **FR-53's previous values are unconditional.** The reporter's rule
    // (FR-19) makes them conditional on an interaction; the administrator's
    // are not, and no interaction is consulted.
    const calls: Call[] = [];
    const { service, audit } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: { name: 'New name' },
    });

    const payload = audit.written[0]?.payload;
    expect(payload?.['previousValues']).toEqual({ name: 'Brown leather wallet' });
  });
});

describe('ReportAdministratorEditService — the image replacement', () => {
  it('stores the new blob and writes its path', async () => {
    const calls: Call[] = [];
    const { service, written, stored } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: {},
      image: anImage(),
    });

    expect(stored).toHaveLength(1);
    expect(written[0]).toEqual({ imageRef: 'reports/new-image.jpg' });
  });

  it('uploads the blob before the transaction', async () => {
    const calls: Call[] = [];
    const { service } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: {},
      image: anImage(),
    });

    expect(calls.indexOf('images.store:reports')).toBeLessThan(
      calls.indexOf('transactions.run'),
    );
  });

  it('deletes the replaced blob after the commit', async () => {
    const calls: Call[] = [];
    const { service, deleted } = aService({
      calls,
      report: aReport({ imageRef: { path: 'reports/old-image.jpg' } }),
    });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: {},
      image: anImage(),
    });

    expect(deleted).toEqual(['reports/old-image.jpg']);
    expect(calls.indexOf('transactions.commit')).toBeLessThan(
      calls.indexOf('images.delete:reports/old-image.jpg'),
    );
  });

  it('does not delete a blob when the report had none', async () => {
    const calls: Call[] = [];
    const { service, deleted } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: {},
      image: anImage(),
    });

    expect(deleted).toEqual([]);
  });

  it('deletes the new blob when the row write fails', async () => {
    // **The write is compensating.** The new blob is deleted after the
    // rollback, so a failed edit does not leave an orphaned blob behind.
    const calls: Call[] = [];
    const { service, deleted } = aService({ calls, writeFails: true });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: {},
        image: anImage(),
      }),
    ).rejects.toThrow(/row write failed/);

    expect(deleted).toEqual(['reports/new-image.jpg']);
    expect(calls.indexOf('transactions.rollback')).toBeLessThan(
      calls.indexOf('images.delete:reports/new-image.jpg'),
    );
  });

  it('does not delete the old blob when the row write fails', async () => {
    // **The old blob was never touched,** so the report still points at a
    // blob that exists.
    const calls: Call[] = [];
    const { service, deleted } = aService({
      calls,
      report: aReport({ imageRef: { path: 'reports/old-image.jpg' } }),
      writeFails: true,
    });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: {},
        image: anImage(),
      }),
    ).rejects.toThrow(/row write failed/);

    expect(deleted).not.toContain('reports/old-image.jpg');
  });

  it('writes nothing when the blob store fails', async () => {
    const calls: Call[] = [];
    const { service, written } = aService({ calls, storeFails: true });

    await expect(
      service.edit({
        reportId: 'report-1',
        actor: { actorId: 'admin-1' },
        changes: { name: 'New name' },
        image: anImage(),
      }),
    ).rejects.toThrow(/blob store failed/);

    expect(written).toEqual([]);
    expect(calls).not.toContain('transactions.run');
  });

  it('treats an image-only edit as a change', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({
      calls,
      report: aReport({ imageRef: { path: 'reports/old-image.jpg' } }),
    });

    const result = await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: {},
      image: anImage(),
    });

    expect(result.outcome.kind).toBe('Changed');
    expect(audit.written).toHaveLength(1);
  });

  it('names the image replacement in the audit record', async () => {
    // **FR-53 lists image replacement among the editable things,** so a record
    // that replaced the image and said nothing about it would be incomplete.
    const calls: Call[] = [];
    const { service, audit } = aService({
      calls,
      report: aReport({ imageRef: { path: 'reports/old-image.jpg' } }),
    });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: {},
      image: anImage(),
    });

    expect(audit.written[0]?.payload).toEqual({
      changedFields: { fields: ['imageReplacement'] },
      previousValues: { imageReplacement: 'reports/old-image.jpg' },
    });
  });

  it('records an absent previous image as absent, not empty', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({ calls });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: {},
      image: anImage(),
    });

    const payload = audit.written[0]?.payload;
    const previous = payload?.['previousValues'] as
      | Record<string, string | undefined>
      | undefined;

    expect(previous?.['imageReplacement']).toBeUndefined();
  });

  it('names both the content field and the image replacement', async () => {
    const calls: Call[] = [];
    const { service, audit } = aService({
      calls,
      report: aReport({ imageRef: { path: 'reports/old-image.jpg' } }),
    });

    await service.edit({
      reportId: 'report-1',
      actor: { actorId: 'admin-1' },
      changes: { name: 'New name' },
      image: anImage(),
    });

    expect(audit.written[0]?.payload).toEqual({
      changedFields: { fields: ['name', 'imageReplacement'] },
      previousValues: {
        name: 'Brown leather wallet',
        imageReplacement: 'reports/old-image.jpg',
      },
    });
  });
});
