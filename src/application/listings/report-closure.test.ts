/**
 * The closed-field-set discipline's suite.
 *
 * **The closed sets are the point.** The design rests on two of them: the
 * nine categories, and the deployment's active campus areas. A closed set
 * that fails open is worse than no closed set at all, because the design
 * *looks* like it is validating while it is not.
 *
 * **The load-bearing assertion is the refusal.** When the area list cannot
 * be read, the service must refuse — not fall back to a permissive default.
 * With an empty set every area is rejected; with a fallback every area is
 * accepted. The second is a silent bypass of FR-8, and it is the failure
 * mode this suite exists to rule out.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';

import {
  ReportCreationService,
  type CreateReportRequest,
} from '@/application/listings/report-creation-service';

import {
  CampusAreaUnavailableError,
  type CampusAreaReader,
} from '@/application/listings/ports/campus-area-reader';
import type { ImageStore } from '@/application/listings/ports/image-store';
import type { ReportRepository } from '@/application/listings/ports/report-repository';

import type {
  AuditEventRecord,
  TrailPage,
} from '@/application/ports/audit-event-repository';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEvent } from '@/domain/audit';
import type { CampusArea, PersistedReport, ValidatedReport } from '@/domain/listings';

const AREAS: readonly CampusArea[] = [
  { value: 'library', label: 'Library', active: true },
];

const NOW = new Date('2026-10-28T12:00:00.000Z');

const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The order the calls happened in. */
type Call = string;

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

/**
 * Build a service whose campus-area reader behaves as the test names.
 */
function aService(options: {
  readonly areas?: readonly CampusArea[];
  readonly readFails?: boolean;
  readonly calls: Call[];
}): ReportCreationService {
  const reader: CampusAreaReader = {
    listActive: async (): Promise<readonly CampusArea[]> => {
      options.calls.push('areas.listActive');

      if (options.readFails) {
        throw new CampusAreaUnavailableError();
      }

      return options.areas ?? AREAS;
    },
  };

  const images: ImageStore = {
    store: async (): Promise<{ path: string }> => {
      options.calls.push('images.store');

      return { path: 'reports/stored-image.jpg' };
    },
    delete: async (): Promise<void> => {
      options.calls.push('images.delete');
    },
  };

  const reports: ReportRepository = {
    create: async (report: ValidatedReport): Promise<PersistedReport> => {
      options.calls.push('reports.create');

      return { ...report, id: 'a-minted-id' };
    },
  };

  const transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      options.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  const audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      options.calls.push('audit.record');

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

  return new ReportCreationService(
    reports,
    reader,
    images,
    audit,
    transactions,
    { now: (): Date => NOW },
  );
}

describe('the closed campus-area set', () => {
  it('refuses the submission when the area list cannot be read', async () => {
    const calls: Call[] = [];

    // The reader failed, so the set of valid areas is unknown. Proceeding
    // would mean validating against an assumed set.
    await expect(aService({ readFails: true, calls }).create(aRequest())).rejects.toThrow(
      CampusAreaUnavailableError,
    );
  });

  it('stores nothing when the area list cannot be read', async () => {
    const calls: Call[] = [];

    await expect(aService({ readFails: true, calls }).create(aRequest())).rejects.toThrow();

    // No upload, no row, no event. A refusal must leave no trace.
    expect(calls).toEqual(['areas.listActive']);
  });

  it('refuses every area when the list is empty, rather than accepting them all', async () => {
    const calls: Call[] = [];

    // An empty set is the *strict* outcome. If a failed read produced an
    // empty set and the service accepted areas anyway, the read failure
    // would be indistinguishable from a permissive default.
    await expect(
      aService({ areas: [], calls }).create(aRequest()),
    ).rejects.toThrow(ValidationError);
  });

  it('names the campus area as the offending field when the area is not in the set', async () => {
    const calls: Call[] = [];

    try {
      await aService({ areas: [], calls }).create(aRequest());
      expect.unreachable('The service should have refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('campusArea');
    }
  });

  it('accepts an area that is in the active set', async () => {
    const calls: Call[] = [];

    await aService({ calls }).create(aRequest());

    expect(calls).toContain('reports.create');
  });

  it('refuses an area that is not in the active set', async () => {
    const calls: Call[] = [];

    await expect(
      aService({ calls }).create(
        aRequest({
          draft: { ...aRequest().draft, campusArea: 'sports_centre' },
        }),
      ),
    ).rejects.toThrow(ValidationError);

    expect(calls).not.toContain('reports.create');
  });

  it('refuses a category that is not one of the nine', async () => {
    const calls: Call[] = [];

    // The other closed set. The category list lives in the domain, so this
    // is a *refusal* rather than a read failure — but the outcome is the
    // same: nothing is stored.
    await expect(
      aService({ calls }).create(
        aRequest({
          draft: { ...aRequest().draft, category: 'Vehicle' },
        }),
      ),
    ).rejects.toThrow(ValidationError);

    expect(calls).toEqual(['areas.listActive']);
  });

  it('does not upload an image for a submission that breaks a closed set', async () => {
    const calls: Call[] = [];

    // The image must not reach the blob store for a submission the domain
    // will refuse — the upload is part of the write, so an upload followed
    // by a refusal would leave a blob to clean up.
    await expect(
      aService({ calls }).create(
        aRequest({
          draft: { ...aRequest().draft, category: 'Vehicle' },
          image: { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' },
        }),
      ),
    ).rejects.toThrow(ValidationError);

    expect(calls).not.toContain('images.store');
  });
});
