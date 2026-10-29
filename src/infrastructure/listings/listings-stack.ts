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
import {
  ReportEditService,
  type ReportEditClock,
} from '@/application/listings/report-edit-service';
import {
  ReportDeletionService,
  type ReportDeletionLogger,
} from '@/application/listings/report-deletion-service';
import {
  ReportWithdrawalService,
  type ReportWithdrawalClock,
} from '@/application/listings/report-withdrawal-service';
import {
  ReportAdministratorEditService,
  type ReportAdministratorEditClock,
} from '@/application/listings/report-administrator-edit-service';
import { ReportListingService } from '@/application/listings/report-listing-service';
import { ReportDetailService } from '@/application/listings/report-detail-service';
import { ReportVisibilityService } from '@/application/listings/report-visibility-service';
import { ReportImageDeliveryService } from '@/application/listings/report-image-delivery-service';
import { DefaultClaimRejectionEmailBuilder } from '@/application/listings/claim-rejection-email';

import { PrismaAuditEventRepository } from '@/infrastructure/audit/prisma-audit-event-repository';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTransactionFactory } from '@/infrastructure/db/prisma-transaction-factory';
import { SmtpEmailSender, readSmtpConfig } from '@/infrastructure/accounts/smtp-email-sender';

import {
  BlobImageStore,
} from './blob-image-store';
import { BlobImageReader } from './blob-image-reader';
import { BlobImageQuotaReader } from './blob-image-quota-reader';
import { PrismaAuditTrailDeletion } from './prisma-audit-trail-deletion';
import { PrismaAuditTrailVisibilityReader } from './prisma-audit-trail-visibility-reader';
import { PrismaCampusAreaReader } from './prisma-campus-area-reader';
import { PrismaClaimVisibilityReader } from './prisma-claim-visibility-reader';
import { PrismaRecoveryResponseVisibilityReader } from './prisma-recovery-response-visibility-reader';
import { PrismaReportImageReader } from './prisma-report-image-reader';
import { PrismaReportInteractionReader } from './prisma-report-interaction-reader';
import { PrismaReportInteractionResolver } from './prisma-report-interaction-resolver';
import { PrismaReportListingReader } from './prisma-report-listing-reader';
import { PrismaReportRepository } from './prisma-report-repository';
import { PrismaReportVisibilityReader } from './prisma-report-visibility-reader';
import { PrismaThreadVisibilityReader } from './prisma-thread-visibility-reader';

import { ImageStorageError, type ImageStore } from '@/application/listings/ports/image-store';
import type { ImageQuotaReader } from '@/application/listings/ports/image-quota-reader';
import type { EmailSender } from '@/application/ports/email-sender';

/** The listings stack, assembled. */
export interface ListingsStack {
  readonly reports: ReportCreationService;
  /** FR-9 — the reporter's edit. */
  readonly reportEdits: ReportEditService;
  /** FR-10 — the hard delete. */
  readonly reportDeletions: ReportDeletionService;
  /** FR-11 — the withdrawal. */
  readonly reportWithdrawals: ReportWithdrawalService;
  /** FR-53 — the administrator's moderation edit. */
  readonly administratorEdits: ReportAdministratorEditService;
  /** FR-14 and FR-49 — the search pool and the partitions. */
  readonly listings: ReportListingService;
  /** FR-13 — the authenticated detail view. */
  readonly details: ReportDetailService;
  /** FR-8 and FR-37 — the authorised image delivery. */
  readonly imageDelivery: ReportImageDeliveryService;
}

/** The system clock, as the clock port. */
const systemClock: ReportCreationClock & ReportEditClock & ReportWithdrawalClock & ReportAdministratorEditClock = {
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
 * The quota reader, or `null` when the deployment has no blob store.
 *
 * **A quota reader without a store has nothing to measure.** The usage is
 * read from the blob store, so a deployment with no store has no usage to
 * read — and the quota check is skipped rather than refusing every upload
 * on a measurement that could never be taken.
 *
 * The counterpart is the **reader**, which always exists: a deployment with
 * a store always has an image to deliver, and the delivery route must
 * answer rather than fail to build.
 */
function buildQuotaReader(env: NodeJS.ProcessEnv): ImageQuotaReader | null {
  const token = env.BLOB_READ_WRITE_TOKEN;

  if (!token || token.length === 0) {
    return null;
  }

  return new BlobImageQuotaReader();
}

/**
 * The email sender, or `null` when SMTP is not configured.
 *
 * **A null sender is not a refusal.** The email is a notification of a fact
 * that is already true — the Claim *is* rejected — so a deployment with no
 * SMTP cannot make the withdrawal wrong. The withdrawal stands and the
 * notification is skipped.
 */
function buildEmailSender(env: NodeJS.ProcessEnv): EmailSender | null {
  const config = readSmtpConfig(env);

  if (!config) {
    return null;
  }

  return new SmtpEmailSender(config);
}

/**
 * The email sender a deployment with **no** SMTP gets.
 *
 * Every send fails, so a caller that logs the failure records that the
 * notification did not go out — rather than the failure passing silently.
 */
class UnconfiguredEmailSender implements EmailSender {
  async send(): Promise<never> {
    throw new Error('This deployment is not configured to send email.');
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

  // The quota reader is **optional**, and a deployment with a blob store
  // always has one. The quota check runs on every image write
  // (image-handling §4), and the reader measures the store's real usage.
  const quota: ImageQuotaReader | null = buildQuotaReader(env);

  const reports = new PrismaReportRepository(prisma);
  const campusAreas = new PrismaCampusAreaReader(prisma);
  const interactions = new PrismaReportInteractionReader(prisma);
  const resolver = new PrismaReportInteractionResolver(prisma);
  const auditTrailDeletion = new PrismaAuditTrailDeletion();

  const emails: EmailSender = buildEmailSender(env) ?? new UnconfiguredEmailSender();

  // The deletion's blob-delete failure is **recorded, not raised**. A failed
  // blob delete leaves an orphaned blob; the report is already gone, and
  // that is what the member asked for. The operational log line is the
  // record, and the image store's own retry mechanism owns the retry.
  const deletionLogger: ReportDeletionLogger = {
    recordBlobDeleteFailure: (path: string, error: unknown): void => {
      // The operational log is the record of a failed compensating delete,
      // and it must reach an operator. The payload carries the path and the
      // error's name only — never the error's message, which could carry a
      // blob URL.
      console.error(
        JSON.stringify({
          event: 'report.image_delete_failed',
          path,
          error: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    },
  };

  return {
    reports: new ReportCreationService(
      reports,
      campusAreas,
      images,
      audit,
      transactions,
      systemClock,
      quota ?? undefined,
    ),
    reportEdits: new ReportEditService(
      reports,
      interactions,
      audit,
      transactions,
      systemClock,
      campusAreas,
    ),
    reportDeletions: new ReportDeletionService(
      reports,
      interactions,
      auditTrailDeletion,
      images,
      transactions,
      deletionLogger,
    ),
    reportWithdrawals: new ReportWithdrawalService(
      reports,
      interactions,
      resolver,
      audit,
      transactions,
      systemClock,
      emails,
      new DefaultClaimRejectionEmailBuilder(),
    ),
    administratorEdits: new ReportAdministratorEditService(
      reports,
      campusAreas,
      images,
      audit,
      transactions,
      systemClock,
      quota ?? undefined,
    ),
    listings: new ReportListingService({
      listings: new PrismaReportListingReader(prisma),
    }),
    // **The detail service sits on top of the visibility service.** The
    // visibility service owns the FR-39 projection — which fields this
    // viewer may see of this report — and the detail service adds the
    // FR-13 gate on top of it. The gate is the only thing the detail
    // service decides, so there is one place where the projection is
    // assembled and one place where it is gated.
    details: new ReportDetailService({
      visibility: new ReportVisibilityService({
        reports: new PrismaReportVisibilityReader(prisma),
        claims: new PrismaClaimVisibilityReader(prisma),
        responses: new PrismaRecoveryResponseVisibilityReader(prisma),
        threads: new PrismaThreadVisibilityReader(prisma),
        trail: new PrismaAuditTrailVisibilityReader(prisma),
      }),
    }),
    // **The delivery service owns the whole authorisation.** The route
    // resolves the actor and hands it here; the service decides whether the
    // bytes are delivered and reads the blob itself. The route never reads
    // the blob — that is the whole point of `image-handling.md` §3's
    // "auth is verified in the route handler immediately adjacent to the
    // blob read", and a route that read the blob itself would put the two
    // decisions in different places.
    imageDelivery: new ReportImageDeliveryService({
      reportImages: new PrismaReportImageReader(prisma),
      images: new BlobImageReader(),
    }),
  };
}
