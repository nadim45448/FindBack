/**
 * The compensating write's suite.
 *
 * **The write is compensating, not atomic.** A blob store cannot join a
 * PostgreSQL transaction, so the honest description is: upload the blob,
 * write the row, and if the row write fails, delete the blob.
 *
 * **The three failures the PRD names (image-handling §5) are asserted
 * here:**
 *
 * 1. **A failed upload creates no report.** The upload is part of the
 *    write, not a follow-up.
 * 2. **A failed row write deletes the blob.** The delete is issued *after*
 *    the rollback — a delete inside a transaction that is about to roll
 *    back would be undone by that rollback and orphan the blob anyway.
 * 3. **A failed delete does not mask the original failure.** The member's
 *    report did not get created, and that is the error they must see.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';

import {
  ReportCreationService,
  type CreateReportRequest,
} from '@/application/listings/report-creation-service';

import {
  ImageStorageError,
  type ImageStore,
} from '@/application/listings/ports/image-store';
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

/** A request with an image. */
function aRequest(): CreateReportRequest {
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
    image: { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' },
  };
}

/**
 * Build a service whose ports fail in the way the test names.
 */
function aService(options: {
  readonly storeFails?: boolean;
  readonly writeFails?: boolean;
  readonly deleteFails?: boolean;
  readonly calls: Call[];
}): ReportCreationService {
  const images: ImageStore = {
    store: async (): Promise<{ path: string }> => {
      options.calls.push('images.store');

      if (options.storeFails) {
        throw new ImageStorageError('The blob store did not respond.');
      }

      return { path: 'reports/stored-image.jpg' };
    },
    delete: async (path: string): Promise<void> => {
      options.calls.push(`images.delete:${path}`);

      if (options.deleteFails) {
        throw new ImageStorageError('The blob store did not respond.');
      }
    },
  };

  const reports: ReportRepository = {
    create: async (report: ValidatedReport): Promise<PersistedReport> => {
      options.calls.push('reports.create');

      if (options.writeFails) {
        throw new Error('The row write failed.');
      }

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

  const transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      options.calls.push('transactions.run');

      // The transaction "rolls back" by rejecting, which is what the
      // factory's contract says a failure does.
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
    { listActive: async (): Promise<readonly CampusArea[]> => AREAS },
    images,
    audit,
    transactions,
    { now: (): Date => NOW },
  );
}

describe('the compensating write', () => {
  it('creates no report when the upload fails', async () => {
    const calls: Call[] = [];

    await expect(aService({ storeFails: true, calls }).create(aRequest())).rejects.toThrow(
      ImageStorageError,
    );

    // The upload is part of the write, not a follow-up. A failure here means
    // **no report is created** (image-handling §5).
    expect(calls).toEqual(['images.store']);
  });

  it('deletes the blob when the row write fails', async () => {
    const calls: Call[] = [];

    await expect(aService({ writeFails: true, calls }).create(aRequest())).rejects.toThrow(
      'The row write failed.',
    );

    // The delete happens **after** the rollback, not inside it.
    expect(calls).toEqual([
      'images.store',
      'transactions.run',
      'reports.create',
      'images.delete:reports/stored-image.jpg',
    ]);
  });

  it('does not mask the original failure when the compensating delete fails', async () => {
    const calls: Call[] = [];

    // The delete throws, but the member must see *their* failure — the
    // report was not created. The orphaned blob is an operational problem,
    // not theirs.
    await expect(
      aService({ writeFails: true, deleteFails: true, calls }).create(aRequest()),
    ).rejects.toThrow('The row write failed.');
  });

  it('attempts the compensating delete even when the delete fails', async () => {
    const calls: Call[] = [];

    await expect(
      aService({ writeFails: true, deleteFails: true, calls }).create(aRequest()),
    ).rejects.toThrow();

    // The delete was **attempted** — a failed delete is recorded for retry
    // rather than silently leaked.
    expect(calls).toContain('images.delete:reports/stored-image.jpg');
  });

  it('does not delete anything when the write succeeds', async () => {
    const calls: Call[] = [];

    await aService({ calls }).create(aRequest());

    expect(calls.some((call) => call.startsWith('images.delete'))).toBe(false);
  });

  it('does not delete anything when there was no image to store', async () => {
    const calls: Call[] = [];

    await expect(
      aService({ writeFails: true, calls }).create({
        ...aRequest(),
        image: null,
      }),
    ).rejects.toThrow('The row write failed.');

    // Nothing was uploaded, so nothing can be orphaned.
    expect(calls.some((call) => call.startsWith('images.delete'))).toBe(false);
    expect(calls.some((call) => call.startsWith('images.store'))).toBe(false);
  });
});
