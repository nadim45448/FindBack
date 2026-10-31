/**
 * The image quota's enforcement at the application layer.
 *
 * **The quota is a business outcome, not a crash.** An upload that would
 * exceed the budget is rejected with a clear error, and **nothing is
 * stored** — no blob is written, no report row is created, and no existing
 * image is deleted to make room (image-handling §4).
 *
 * **The check runs before the write, on the would-be total.** That is the
 * whole point of the check being here rather than at month end: an upload
 * that exactly fills the remaining space is allowed, and one byte more is
 * refused.
 *
 * **Two write paths are covered, and they are different writes.** The
 * creation path attaches an image to a new report; the FR-53 path replaces
 * an image on an existing one. A quota checked on only one of them would
 * leave the other able to over-run the budget — and FR-53's path is the one
 * that *adds* bytes while an old blob is still stored, so it is the path
 * where the ceiling is most likely to be reached.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';

import {
  ReportCreationService,
  type CreateReportRequest,
} from '@/application/listings/report-creation-service';
import {
  ReportAdministratorEditService,
  type EditReportAsAdministratorRequest,
} from '@/application/listings/report-administrator-edit-service';

import type { CampusAreaReader } from '@/application/listings/ports/campus-area-reader';
import type {
  ImageQuotaReader,
} from '@/application/listings/ports/image-quota-reader';
import type {
  ImageStore,
  ImageUpload,
  StoredImage,
} from '@/application/listings/ports/image-store';
import type { ReportRepository } from '@/application/listings/ports/report-repository';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEvent } from '@/domain/audit';
import type { CampusArea, PersistedReport, ValidatedReport } from '@/domain/listings';

import { aReport } from './report-lifecycle-fixtures';

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

/** The bytes the deployment already holds. */
const USED_BYTES = 1024;

/** The deployment's ceiling. */
const QUOTA_BYTES = 2048;

/**
 * A recording fake of the ports the two write paths use.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The usage the quota reader reports. */
  usedBytes = USED_BYTES;

  /** The error the quota reader throws, if any. */
  quotaError: Error | null = null;

  /** Make the row write fail, to exercise the compensating image delete. */
  failTheWrite = false;

  readonly quota: ImageQuotaReader = {
    readUsage: async () => {
      this.calls.push('quota.readUsage');

      if (this.quotaError) {
        throw this.quotaError;
      }

      return { usedBytes: this.usedBytes, quotaBytes: QUOTA_BYTES };
    },
  };

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

  readonly reports: ReportRepository = {
    create: async (
      reportId: string,
      report: ValidatedReport,
      _transaction: TransactionHandle,
    ): Promise<PersistedReport> => {
      this.calls.push('reports.create');

      return { ...report, id: reportId };
    },
    findById: async (): Promise<PersistedReport | null> => {
      this.calls.push('reports.findById');

      // **The report exists.** The FR-53 path needs one to reach the image
      // replacement at all, and a harness that returned `null` would test
      // the not-found refusal instead of the quota.
      return aReport({ imageRef: { path: 'reports/old-image.jpg' } });
    },
    update: async (): Promise<PersistedReport> => {
      this.calls.push('reports.update');

      if (this.failTheWrite) {
        throw new Error('The row write failed.');
      }

      return aReport({ imageRef: { path: 'reports/stored-image.jpg' } });
    },
    delete: async (): Promise<void> => {
      throw new Error('delete is not reached in these tests.');
    },
  };

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly clock = { now: (): Date => NOW };

  /**
   * The index of the blob upload in the call order.
   *
   * **The prefix is entity-scoped** — `reports/{entityId}/` (image-handling
   * §4) — and the id is minted per request, so the call is found by its
   * shape rather than by an exact string.
   */
  storeCallIndex(): number {
    return this.calls.findIndex((call) => /^images\.store:reports\//.test(call));
  }

  readonly audit: AuditWriter = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The write paths never read the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The write paths never read the trail.');
    },
  });

  /** The creation service under test. */
  creationService(): ReportCreationService {
    return new ReportCreationService(
      this.reports,
      this.areas,
      this.images,
      this.audit,
      this.transactions,
      this.clock,
      this.quota,
      QUOTA_BYTES,
    );
  }

  /** The administrator's edit service under test. */
  administratorEditService(): ReportAdministratorEditService {
    return new ReportAdministratorEditService(
      this.reports,
      this.areas,
      this.images,
      this.audit,
      this.transactions,
      this.clock,
      this.quota,
      QUOTA_BYTES,
    );
  }
}

/** A creation request carrying an image. */
function aRequest(image: ImageUpload): CreateReportRequest {
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
    image,
  };
}

/** An image of the given size. */
function anImageOfSize(bytes: number): ImageUpload {
  return { bytes: Buffer.alloc(bytes, 0x41), contentType: 'image/jpeg' };
}

describe('the quota on the creation path', () => {
  it('reads the usage before it writes', async () => {
    const harness = new Harness();

    await harness.creationService().create(aRequest(anImageOfSize(100)));

    // **The check precedes the write.** A quota discovered after the write
    // would have to be enforced by deleting what was just stored, and
    // image-handling §4 forbids deleting an existing image to make room.
    expect(harness.calls.indexOf('quota.readUsage')).toBeLessThan(
      harness.storeCallIndex(),
    );
  });

  it('allows an upload that fits', async () => {
    const harness = new Harness();

    await harness.creationService().create(aRequest(anImageOfSize(100)));

    expect(harness.storeCallIndex()).toBeGreaterThanOrEqual(0);
  });

  it('allows an upload that exactly fills the remaining space', async () => {
    const harness = new Harness();

    // 1024 used of 2048 — 1024 bytes of headroom, and the upload is 1024.
    await harness.creationService().create(aRequest(anImageOfSize(1024)));

    expect(harness.storeCallIndex()).toBeGreaterThanOrEqual(0);
  });

  it('refuses an upload one byte over the remaining space', async () => {
    const harness = new Harness();

    await expect(
      harness.creationService().create(aRequest(anImageOfSize(1025))),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores nothing when the upload is refused', async () => {
    const harness = new Harness();

    await expect(
      harness.creationService().create(aRequest(anImageOfSize(1025))),
    ).rejects.toBeInstanceOf(ValidationError);

    // **Nothing is stored.** No blob, no report, no audit event. A refusal
    // that left a blob behind would be a leak against the budget it was
    // supposed to enforce.
    expect(harness.calls.some((call) => call.startsWith('images.store'))).toBe(false);
    expect(harness.calls).not.toContain('reports.create');
    expect(harness.calls).not.toContain('audit.record');
  });

  it('names the image field in the refusal', async () => {
    const harness = new Harness();

    const error = await harness.creationService()
      .create(aRequest(anImageOfSize(1025)))
      .catch((thrown: unknown) => thrown as ValidationError);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe('image');
  });

  it('never deletes an existing image to make room', async () => {
    const harness = new Harness();

    await expect(
      harness.creationService().create(aRequest(anImageOfSize(1025))),
    ).rejects.toBeInstanceOf(ValidationError);

    // **A refusal frees nothing.** image-handling §4 forbids deleting a
    // member's image to make room for another's.
    expect(harness.calls.some((call) => call.startsWith('images.delete'))).toBe(false);
  });

  it('refuses the upload when the usage cannot be read', async () => {
    // **An unmeasured budget is not a budget with room left.** Proceeding on
    // an unknown usage is exactly the silent over-run ADR-4 forbids.
    const harness = new Harness();
    harness.quotaError = new Error('the blob store did not respond');

    await expect(
      harness.creationService().create(aRequest(anImageOfSize(100))),
    ).rejects.toThrow();

    expect(harness.calls).not.toContain('images.store:reports');
  });
});

describe('the quota on the FR-53 replacement path', () => {
  /** An administrator's edit that replaces the image. */
  function anEditWith(image: ImageUpload): EditReportAsAdministratorRequest {
    return {
      reportId: 'report-1',
      actor: { actorId: 'the-administrator' },
      changes: {},
      image,
    };
  }

  it('reads the usage before it writes the replacement', async () => {
    const harness = new Harness();

    await harness
      .administratorEditService()
      .edit(anEditWith(anImageOfSize(100)))
      .catch(() => undefined);

    expect(harness.calls.indexOf('quota.readUsage')).toBeLessThan(
      harness.storeCallIndex(),
    );
  });

  it('refuses a replacement that would exceed the quota', async () => {
    const harness = new Harness();

    await expect(
      harness.administratorEditService().edit(anEditWith(anImageOfSize(1025))),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores nothing when the replacement is refused', async () => {
    const harness = new Harness();

    await expect(
      harness.administratorEditService().edit(anEditWith(anImageOfSize(1025))),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(harness.calls.some((call) => call.startsWith('images.store'))).toBe(false);
  });

  it('never deletes the replaced image to make room', async () => {
    // **The old blob stays.** A refused replacement leaves the report
    // exactly as it was — the member's existing image is not the thing that
    // gets sacrificed to the budget.
    const harness = new Harness();

    await expect(
      harness.administratorEditService().edit(anEditWith(anImageOfSize(1025))),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(harness.calls.some((call) => call.startsWith('images.delete'))).toBe(false);
  });

  it('allows a replacement that fits', async () => {
    const harness = new Harness();

    await harness
      .administratorEditService()
      .edit(anEditWith(anImageOfSize(100)))
      .catch(() => undefined);

    // The quota did not refuse the upload, so the replacement was written.
    expect(harness.storeCallIndex()).toBeGreaterThanOrEqual(0);
  });

  it('deletes the replaced image only after the row is written', async () => {
    // **The order is the cleanup rule.** image-handling §4: FR-53's
    // replacement uploads a new blob and deletes the old one, and the old
    // blob's delete is issued *after* the database side has settled — a
    // delete inside a transaction that is about to roll back would be undone
    // by that rollback and orphan the blob.
    const harness = new Harness();

    await harness
      .administratorEditService()
      .edit(anEditWith(anImageOfSize(100)))
      .catch(() => undefined);

    const stored = harness.storeCallIndex();
    const written = harness.calls.indexOf('reports.update');
    const deleted = harness.calls.findIndex((call) => call.startsWith('images.delete'));

    expect(written).toBeGreaterThan(stored);
    expect(deleted).toBeGreaterThan(written);
  });

  it('keeps the old image when the row write fails', async () => {
    // **A failed write leaves both blobs.** The new blob is compensated
    // away and the old one was never touched — the report still points at
    // the image it always pointed at.
    const harness = new Harness();
    harness.failTheWrite = true;

    await expect(
      harness.administratorEditService().edit(anEditWith(anImageOfSize(100))),
    ).rejects.toThrow();

    const deletes = harness.calls.filter((call) => call.startsWith('images.delete'));

    // **Only the new blob is compensated away.** The old blob's delete is
    // issued after a successful commit, and there was no commit.
    //
    // The new blob's path is entity-scoped — `reports/{reportId}/` — so the
    // delete is named by shape.
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatch(/^images\.delete:reports\/report-1\/stored-image\.jpg$/);
  });
});
