/**
 * The report creation service's suite.
 *
 * **The sequence is the mechanism.** The service validates, then uploads the
 * blob, then writes the row and its audit event in one transaction — and the
 * order is asserted here, because the order is what delivers the PRD's rule
 * that a failed image means no report.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order, so the assertions are about the *orchestration* rather than
 * about a mock's return value.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';

import {
  ReportCreationService,
  type CreateReportRequest,
} from '@/application/listings/report-creation-service';

import type {
  CampusAreaReader,
} from '@/application/listings/ports/campus-area-reader';
import type {
  ImageStore,
  ImageUpload,
  StoredImage,
} from '@/application/listings/ports/image-store';
import type {
  ReportRepository,
} from '@/application/listings/ports/report-repository';

import type {
  AuditEventRecord,
  TrailPage,
} from '@/application/ports/audit-event-repository';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEvent } from '@/domain/audit';

import type {
  CampusArea,
  PersistedReport,
  ValidatedReport,
} from '@/domain/listings';

/** The order the calls happened in. */
type Call = string;

/** The areas the reader returns. */
const AREAS: readonly CampusArea[] = [
  { value: 'library', label: 'Library', active: true },
];

/** A fixed instant. */
const NOW = new Date('2026-10-28T12:00:00.000Z');

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/**
 * A recording fake of the three ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  readonly areas: CampusAreaReader = {
    listActive: async (): Promise<readonly CampusArea[]> => {
      this.calls.push('areas.listActive');

      return AREAS;
    },
  };

  readonly images: ImageStore = {
    store: async (_image: ImageUpload, prefix: string): Promise<StoredImage> => {
      this.calls.push(`images.store:${prefix}`);

      return { path: `${prefix}/stored-image.jpg` };
    },
    delete: async (path: string): Promise<void> => {
      this.calls.push(`images.delete:${path}`);
    },
  };

  /** The transaction handle the repository was given, if any. */
  repositoryHandle: TransactionHandle | null = null;

  /** The validated report the repository was given. */
  received: ValidatedReport | null = null;

  readonly reports: ReportRepository = {
    create: async (report: ValidatedReport, transaction: TransactionHandle): Promise<PersistedReport> => {
      this.calls.push('reports.create');
      this.repositoryHandle = transaction;
      this.received = report;

      return { ...report, id: 'a-minted-id' };
    },
    // The bolt-8 lifecycle methods. **This suite exercises the create path
    // only**, so they are refusals — a test that reached one would be a test
    // of the wrong thing, and a silent success would hide the mistake.
    findById: async (): Promise<PersistedReport | null> => {
      throw new Error('findById is not part of the create path.');
    },
    update: async (): Promise<PersistedReport> => {
      throw new Error('update is not part of the create path.');
    },
    delete: async (): Promise<void> => {
      throw new Error('delete is not part of the create path.');
    },
  };

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly clock = { now: (): Date => NOW };

  /** The audit events the writer appended. */
  readonly recorded: AuditEventRecord[] = [];

  /** The real `AuditWriter` over a fake repository. */
  readonly audit: AuditWriter = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.recorded.push(event);

      return event as unknown as AuditEvent;
    },

    // The creation path never reads the trail, so a read here is a bug
    // rather than an unimplemented capability.
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The creation path never reads the trail.');
    },

    listAll: async (): Promise<TrailPage> => {
      throw new Error('The creation path never reads the trail.');
    },
  });

  /** The service under test. */
  service(): ReportCreationService {
    return new ReportCreationService(
      this.reports,
      this.areas,
      this.images,
      this.audit,
      this.transactions,
      this.clock,
    );
  }
}

/** A request with no image. */
function aRequest(overrides: Partial<CreateReportRequest> = {}): CreateReportRequest {
  return {
    draft: {
      type: 'Lost',
      name: 'Brown leather wallet',
      category: 'Wallet',
      description: 'A brown leather wallet with a folded receipt inside.',
      date: '2026-10-28',
      campusArea: 'library',
      exactPlace: null,
      identifyingDetails: null,
    },
    actor: { actorId: 'the-reporter' },
    ...overrides,
  };
}

describe('the report creation service', () => {
  it('validates before it uploads, and uploads before it writes', async () => {
    const harness = new Harness();

    await harness.service().create(
      aRequest({
        image: { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' },
      }),
    );

    // The order is the mechanism: a submission that breaks a rule must
    // never reach the blob store, and the blob must exist before the row
    // that points at it.
    expect(harness.calls).toEqual([
      'areas.listActive',
      'images.store:reports',
      'transactions.run',
      'reports.create',
      'audit.record',
    ]);
  });

  it('passes the transaction handle to the repository', async () => {
    const harness = new Harness();

    await harness.service().create(aRequest());

    // The report and its audit event commit together, or not at all. The
    // repository cannot write outside the caller's transaction because the
    // handle is a required parameter.
    expect(harness.repositoryHandle).toBe(HANDLE);
  });

  it('sets the reporter from the actor, server-derived', async () => {
    const harness = new Harness();

    await harness.service().create(aRequest());

    expect(harness.received?.reporterId).toBe('the-reporter');
  });

  it('returns the persisted report with the id the repository minted', async () => {
    const harness = new Harness();

    const result = await harness.service().create(aRequest());

    expect(result.report.id).toBe('a-minted-id');
    expect(result.report.status).toBe('Open');
    expect(result.event.type).toBe('report.created');
  });

  it('attaches the image reference after the upload', async () => {
    const harness = new Harness();

    await harness.service().create(
      aRequest({
        image: { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' },
      }),
    );

    expect(harness.received?.imageRef?.path).toBe('reports/stored-image.jpg');
  });

  it('stores no image when the request carries none', async () => {
    const harness = new Harness();

    await harness.service().create(aRequest());

    expect(harness.calls).not.toContain('images.store:reports');
    expect(harness.received?.imageRef).toBeNull();
  });

  it('refuses a submission that breaks a rule, before anything is uploaded', async () => {
    const harness = new Harness();

    await expect(
      harness.service().create(
        aRequest({
          draft: { ...aRequest().draft, category: 'Vehicle' },
        }),
      ),
    ).rejects.toThrow(ValidationError);

    // Nothing was uploaded and no row was written.
    expect(harness.calls).toEqual(['areas.listActive']);
  });

  it('reads the campus areas before validating, because the set is required input', async () => {
    const harness = new Harness();

    await harness.service().create(aRequest());

    expect(harness.calls[0]).toBe('areas.listActive');
  });

  it('raises the event after the write', async () => {
    const harness = new Harness();

    const result = await harness.service().create(aRequest());

    // The event is for a report that now certainly exists. An event for a
    // report that may not exist is worse than a missing one.
    expect(result.event.reportId).toBe('a-minted-id');
    expect(result.event.reporterId).toBe('the-reporter');
  });

  it('records the optional fields as presence flags, never as values', async () => {
    const harness = new Harness();

    const result = await harness.service().create(aRequest());

    // The catalog names no Sensitive Field for event 1, so the trail records
    // *that* the report has identifying details, not what they are.
    expect(result.event.payload.optionalFields).toEqual({
      exactPlace: false,
      identifyingDetails: false,
    });
  });

  it('records the campus area as the location, never the exact place', async () => {
    const harness = new Harness();

    await harness.service().create(
      aRequest({
        draft: { ...aRequest().draft, exactPlace: 'Second floor, east stacks' },
      }),
    );

    // `location` is the campus area. Putting the exact place there would
    // put a Sensitive Field on the trail under a name the catalog did not
    // sanction.
    const recorded = harness.recorded[0];

    expect(recorded?.metadata).toMatchObject({ location: 'library' });
    expect(JSON.stringify(recorded?.metadata)).not.toContain('Second floor');
  });

  it('records the image presence, never the image path', async () => {
    const harness = new Harness();

    await harness.service().create(
      aRequest({
        image: { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' },
      }),
    );

    const recorded = harness.recorded[0];

    expect(recorded?.metadata).toMatchObject({ imagePresence: true });
    expect(JSON.stringify(recorded?.metadata)).not.toContain('stored-image');
  });
});
