/**
 * The listings stack's composition root.
 *
 * **One place where the concrete implementations are wired together.** The
 * route handlers depend on the use cases, and the use cases depend on the
 * ports — so this is the only module that knows both sides.
 *
 * **The clock is injected, not read from `Date.now()`.** The report's date
 * bounds (FR-6's 365 days, FR-7's 30 days) are relative to "today", and a
 * validator that reads the wall clock directly cannot be tested on a
 * boundary. The clock is a port, so a test supplies a fixed one and the
 * boundary cases become ordinary cases.
 *
 * **The blob store is a real adapter, but the image is optional.** A
 * deployment without a `BLOB_READ_WRITE_TOKEN` cannot store images — and the
 * PRD makes the image optional (FR-8), so a report without one is still a
 * valid report. The store is therefore built only when the token is
 * configured; when it is not, a report submitted with an image is refused
 * rather than silently losing it.
 */

import { AuditWriter } from '@/application/audit-writer';
import {
  ReportCreationService,
  type ReportCreationClock,
} from '@/application/listings/report-creation-service';

import { PrismaAuditEventRepository } from '@/infrastructure/audit/prisma-audit-event-repository';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTransactionFactory } from '@/infrastructure/db/prisma-transaction-factory';

import {
  BlobImageStore,
} from './blob-image-store';
import { PrismaCampusAreaReader } from './prisma-campus-area-reader';
import { PrismaReportRepository } from './prisma-report-repository';

import { ImageStorageError, type ImageStore } from '@/application/listings/ports/image-store';

/** The listings stack, assembled. */
export interface ListingsStack {
  readonly reports: ReportCreationService;
}

/** The system clock, as the clock port. */
const systemClock: ReportCreationClock = {
  now: () => new Date(),
};

/**
 * The image store, or `null` when the deployment has no blob store.
 *
 * **A missing token is a configuration state, not a crash.** The image is
 * optional (FR-8), so a deployment without a blob store can still accept
 * reports. The route refuses an image submission when the store is absent,
 * rather than accepting it and dropping the image — an accepted report whose
 * image silently vanished would be a lie about what was stored.
 */
function buildImageStore(env: NodeJS.ProcessEnv): ImageStore | null {
  const token = env.BLOB_READ_WRITE_TOKEN;

  if (!token || token.length === 0) {
    return null;
  }

  return new BlobImageStore();
}

/**
 * The image store a deployment with **no** blob store gets.
 *
 * **The refusal is explicit.** Every upload fails with a message that says
 * the deployment has no store, rather than the upload succeeding and the
 * image quietly vanishing. An accepted report whose image silently
 * disappeared would be a lie about what was stored, and the member would
 * have no way to tell.
 *
 * The `delete` is a no-op because nothing was ever stored — there is
 * nothing to orphan.
 */
class UnconfiguredImageStore implements ImageStore {
  async store(): Promise<never> {
    throw new ImageStorageError(
      'This deployment is not configured to store images. Submit the report without one.',
    );
  }

  async delete(): Promise<void> {
    // Nothing was stored, so there is nothing to delete.
  }
}

/**
 * Build the listings stack.
 *
 * The `env` parameter exists so a test can supply its own configuration
 * without mutating `process.env`.
 */
export function buildListingsStack(env: NodeJS.ProcessEnv = process.env): ListingsStack {
  const transactions = new PrismaTransactionFactory(prisma);
  const audit = new AuditWriter(new PrismaAuditEventRepository(prisma));

  // The image store is a **required** dependency of the service, so a
  // deployment with no blob store gets a store that refuses every upload
  // rather than a `null` the service would have to check for.
  const images: ImageStore = buildImageStore(env) ?? new UnconfiguredImageStore();

  return {
    reports: new ReportCreationService(
      new PrismaReportRepository(prisma),
      new PrismaCampusAreaReader(prisma),
      images,
      audit,
      transactions,
      systemClock,
    ),
  };
}
