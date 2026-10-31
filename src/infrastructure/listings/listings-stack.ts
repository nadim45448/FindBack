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
import {
  ReportCloseService,
  type ReportCloseClock,
} from '@/application/listings/report-close-service';
import { MemberDashboardQuery } from '@/application/listings/member-dashboard-query';
import { ReportListingService } from '@/application/listings/report-listing-service';
import { ReportDetailService } from '@/application/listings/report-detail-service';
import { ReportVisibilityService } from '@/application/listings/report-visibility-service';
import { ReportImageDeliveryService } from '@/application/listings/report-image-delivery-service';
import { CandidateImageDeliveryService } from '@/application/listings/candidate-image-delivery-service';
import { DefaultClaimRejectionEmailBuilder } from '@/application/listings/claim-rejection-email';
import {
  ClaimSubmissionService,
  type ClaimSubmissionClock,
} from '@/application/listings/claim-submission-service';
import { DefaultNewClaimEmailBuilder } from '@/application/listings/new-claim-email';
import {
  ClaimDecisionService,
  type ClaimDecisionClock,
} from '@/application/listings/claim-decision-service';
import { ClaimReviewService } from '@/application/listings/claim-review-service';
import { DefaultClaimDecisionEmailBuilder } from '@/application/listings/claim-decision-email';
import { ClaimThreadService } from '@/application/listings/claim-thread-service';
import {
  RecoveryResponseSubmissionService,
  type RecoveryResponseSubmissionClock,
} from '@/application/listings/recovery-response-submission-service';
import { DefaultNewRecoveryResponseEmailBuilder } from '@/application/listings/new-recovery-response-email';
import {
  RecoveryResponseSelectionService,
} from '@/application/listings/recovery-response-selection-service';
import {
  RecoveryResponseDeterminationService,
} from '@/application/listings/recovery-response-determination-service';
import { DefaultRecoveryResponseDeterminationEmailBuilder } from '@/application/listings/recovery-response-determination-email';
import { RecoveryResponseThreadService } from '@/application/listings/recovery-response-thread-service';
import { RecoveryResponseWithdrawalService } from '@/application/listings/recovery-response-withdrawal-service';
import { ReturnConfirmationService } from '@/application/listings/return-confirmation-service';
import { LostReportCloseoutService } from '@/application/listings/lost-report-closeout-service';
import { LostReportCloseService } from '@/application/listings/lost-report-close-service';
import { ContentRemovalService } from '@/application/listings/content-removal-service';
import { DefaultLostSideNotificationDispatcher } from '@/application/notifications/lost-side-notification-dispatcher';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';

import { PrismaAuditEventRepository } from '@/infrastructure/audit/prisma-audit-event-repository';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaTransactionFactory } from '@/infrastructure/db/prisma-transaction-factory';
import { SmtpEmailSender, readSmtpConfig } from '@/infrastructure/accounts/smtp-email-sender';

import {
  BlobImageStore,
} from './blob-image-store';
import { BlobImageReader } from './blob-image-reader';
import { LocalFilesystemImageReader } from './local-filesystem-image-reader';
import { LocalFilesystemImageStore } from './local-filesystem-image-store';
import { BlobImageQuotaReader } from './blob-image-quota-reader';
import { PrismaAuditTrailDeletion } from './prisma-audit-trail-deletion';
import { PrismaAuditTrailVisibilityReader } from './prisma-audit-trail-visibility-reader';
import { PrismaCampusAreaReader } from './prisma-campus-area-reader';
import { PrismaClaimVisibilityReader } from './prisma-claim-visibility-reader';
import { PrismaRecoveryResponseVisibilityReader } from './prisma-recovery-response-visibility-reader';
import { PrismaReportImageReader } from './prisma-report-image-reader';
import { PrismaCandidateImageReader } from './prisma-candidate-image-reader';
import { PrismaReportInteractionReader } from './prisma-report-interaction-reader';
import { PrismaReportInteractionResolver } from './prisma-report-interaction-resolver';
import { PrismaMemberDashboardReader } from './prisma-member-dashboard-reader';
import { PrismaReportListingReader } from './prisma-report-listing-reader';
import { PrismaReportRepository } from './prisma-report-repository';
import { PrismaReportVisibilityReader } from './prisma-report-visibility-reader';
import { PrismaThreadVisibilityReader } from './prisma-thread-visibility-reader';
import { PrismaClaimRepository } from './prisma-claim-repository';
import { PrismaClaimDecisionReader } from './prisma-claim-decision-reader';
import { PrismaClaimDecisionRepository } from './prisma-claim-decision-repository';
import { PrismaClaimReviewReader } from './prisma-claim-review-reader';
import { PrismaClaimSubjectReader } from './prisma-claim-subject-reader';
import { PrismaClaimThreadReader } from './prisma-claim-thread-reader';
import { PrismaClaimThreadRepository } from './prisma-claim-thread-repository';
import { PrismaPendingClaimReader } from './prisma-pending-claim-reader';
import { PrismaRecoveryResponseReader } from './prisma-recovery-response-reader';
import { PrismaRecoveryResponseRepository } from './prisma-recovery-response-repository';
import { PrismaRecoveryResponseSubjectReader } from './prisma-recovery-response-subject-reader';
import { PrismaLostReportSubjectReader } from './prisma-lost-report-subject-reader';
import { PrismaRecoveryResponseSelectionRepository } from './prisma-recovery-response-selection-repository';
import { PrismaRecoveryResponseResponderReader } from './prisma-recovery-response-responder-reader';
import { PrismaRecoveryResponseThreadReader } from './prisma-recovery-response-thread-reader';
import { PrismaRecoveryResponseThreadRepository } from './prisma-recovery-response-thread-repository';
import { PrismaRecoveryResponseWithdrawalRepository } from './prisma-recovery-response-withdrawal-repository';
import { PrismaReturnConfirmationRepository } from './prisma-return-confirmation-repository';
import { PrismaReturnSubjectReader } from './prisma-return-subject-reader';
import { PrismaLostReportCloseoutRepository } from './prisma-lost-report-closeout-repository';
import { PrismaLostReportCloseoutReader } from './prisma-lost-report-closeout-reader';
import { PrismaContentRemovalRepository } from './prisma-content-removal-repository';

import { ImageStorageError, type ImageStore } from '@/application/listings/ports/image-store';
import type { ImageReader } from '@/application/listings/ports/image-reader';
import type { ImageQuotaReader } from '@/application/listings/ports/image-quota-reader';
import type { EmailSender } from '@/application/ports/email-sender';
import type { RateLimiter } from '@/application/ports/rate-limiter';

import { DatabaseRateLimiter } from '@/infrastructure/accounts/database-rate-limiter';
import {
  readListingsRateLimitConfig,
  type ListingsRateLimitConfig,
} from './rate-limit-config';

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
  /** FR-21 — the administrator's Found-side close. */
  readonly reportCloses: ReportCloseService;
  /** FR-14 and FR-49 — the search pool and the partitions. */
  readonly listings: ReportListingService;
  /** Member dashboard summary counts (mockup `07-dashboard.html`). */
  readonly memberDashboard: MemberDashboardQuery;
  /** FR-13 — the authenticated detail view. */
  readonly details: ReportDetailService;
  /** FR-8 and FR-37 — the authorised image delivery. */
  readonly imageDelivery: ReportImageDeliveryService;
  /**
   * FR-37 and FR-44 — the authorised *candidate* image delivery.
   *
   * **The Lost-side sibling of `imageDelivery`.** A Recovery Response's
   * candidate image is a different entity with different viewers, so it
   * gets its own service rather than a parameterised branch of the report
   * one.
   */
  readonly candidateImageDelivery: CandidateImageDeliveryService;
  /** FR-15 — the Found-side Claim submission. */
  readonly claims: ClaimSubmissionService;
  /** FR-16 — the administrator's claim review screen. */
  readonly claimReviews: ClaimReviewService;
  /** FR-17, FR-18, and FR-22 — the administrator's claim decisions. */
  readonly claimDecisions: ClaimDecisionService;
  /** FR-38 — the per-Claim thread. */
  readonly claimThreads: ClaimThreadService;
  /** FR-40 and FR-44 — the Lost-side Recovery Response submission. */
  readonly recoveryResponses: RecoveryResponseSubmissionService;
  /** FR-43 — the owner's provisional selection of one candidate. */
  readonly recoveryResponseSelections: RecoveryResponseSelectionService;
  /** FR-43 — the owner's determination, recorded by an administrator. */
  readonly recoveryResponseDeterminations: RecoveryResponseDeterminationService;
  /** FR-47 — the per-Recovery-Response thread. */
  readonly recoveryResponseThreads: RecoveryResponseThreadService;
  /** FR-40 — the responder's own withdrawal of their response. */
  readonly recoveryResponseWithdrawals: RecoveryResponseWithdrawalService;
  /**
   * FR-23, FR-24, and FR-25 — the administrator's Confirm Returned.
   *
   * **One service for both directions.** The Found side and the Lost side
   * converge here, and the report's type is what selects between the two
   * preconditions and the two event types.
   */
  readonly returnConfirmations: ReturnConfirmationService;
  /**
   * FR-45 — the Lost-side Returned closeout.
   *
   * **The report's move, every response's resolution, and the two
   * notifications are one act.** The closeout runs inside the confirmation's
   * transaction, so a report cannot be `Returned` with its matched response
   * still in play.
   */
  readonly lostReportCloseouts: LostReportCloseoutService;
  /**
   * FR-21 — the administrator's Lost-side close.
   *
   * **The Lost half of the close.** The Found half is `reportCloses` above,
   * and the two refuse each other's reports — a close that resolved the
   * wrong dependent records would leave live claimants or live responders
   * attached to a `Closed` report.
   */
  readonly lostReportCloses: LostReportCloseService;
  /**
   * FR-36 — the administrator's content removal.
   *
   * **The content is marked withheld, not deleted,** because the audit trail
   * is append-only with no correction path (ADR-6).
   */
  readonly contentRemovals: ContentRemovalService;
  /** The rate limiter the listings routes enforce (ADR-15). */
  readonly rateLimiter: RateLimiter;
  /** The listings rate limits (ADR-15). */
  readonly rateLimits: ListingsRateLimitConfig;
}

/**
 * The application's base URL.
 *
 * **Injected, never read from the ambient environment in the service.** The
 * notification's link is a deployment's configuration, and a test must be
 * able to assert on it.
 */
function readBaseUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.APP_BASE_URL?.trim();

  if (configured && configured.length > 0) {
    return configured.replace(/\/+$/, '');
  }

  return 'http://localhost:3000';
}

/** The system clock, as the clock port. */
const systemClock: ReportCreationClock &
  ReportEditClock &
  ReportWithdrawalClock &
  ReportAdministratorEditClock &
  ReportCloseClock &
  ClaimSubmissionClock &
  ClaimDecisionClock &
  RecoveryResponseSubmissionClock = {
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
function usesLocalFilesystemImageStorage(env: NodeJS.ProcessEnv): boolean {
  const token = env.BLOB_READ_WRITE_TOKEN;

  return (
    env.NODE_ENV === 'development' &&
    (!token || token.length === 0)
  );
}

function buildImageStore(env: NodeJS.ProcessEnv): ImageStore | null {
  const token = env.BLOB_READ_WRITE_TOKEN;

  if (token && token.length > 0) {
    return new BlobImageStore();
  }

  if (usesLocalFilesystemImageStorage(env)) {
    return new LocalFilesystemImageStore();
  }

  return null;
}

function buildImageReader(env: NodeJS.ProcessEnv): ImageReader {
  const token = env.BLOB_READ_WRITE_TOKEN;

  if (token && token.length > 0) {
    return new BlobImageReader();
  }

  if (usesLocalFilesystemImageStorage(env)) {
    return new LocalFilesystemImageReader();
  }

  return new BlobImageReader();
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
  const imageReader = buildImageReader(env);

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

  // ── The Lost-side closeout and the confirmation that holds it ───────────
  //
  // **The two services refer to each other,** so the closeout is built
  // first and attached to the confirmation afterwards. A constructor
  // argument would be a cycle; a setter makes the cycle visible in the
  // wiring rather than hidden in a factory.
  const lostReportCloseouts = new LostReportCloseoutService(
    new PrismaLostReportCloseoutReader(prisma),
    new PrismaLostReportCloseoutRepository(prisma),
    new LostSideEventFactory(audit),
    audit,
    transactions,
    new DefaultLostSideNotificationDispatcher(emails, {
      value: readBaseUrl(env),
    }),
    emails,
  );

  const returnConfirmations = new ReturnConfirmationService(
    new PrismaReturnSubjectReader(prisma),
    new PrismaReturnConfirmationRepository(prisma),
    audit,
    transactions,
  );

  // **The closeout is attached, so the Lost side is complete.** Without it,
  // a confirmation would move the report to `Returned` and leave its
  // Recovery Responses unresolved.
  returnConfirmations.attachCloseout(lostReportCloseouts);

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
    // ── FR-21: the administrator's Found-side close ───────────────────────
    //
    // **The close and the auto-rejections commit together.** The close
    // rejects the report's Pending Claims and writes the report's `Closed`
    // status in one transaction, and the FR-29 claim-rejection emails go
    // out after that transaction commits.
    reportCloses: new ReportCloseService(
      reports,
      resolver,
      audit,
      transactions,
      systemClock,
      emails,
      new DefaultClaimDecisionEmailBuilder(),
    ),
    listings: new ReportListingService({
      listings: new PrismaReportListingReader(prisma),
    }),
    memberDashboard: new MemberDashboardQuery(new PrismaMemberDashboardReader(prisma)),
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
      images: imageReader,
    }),
    // **The candidate image's delivery service owns its whole authorisation.**
    // The route resolves the actor and hands it here; the service decides
    // whether the bytes are delivered and reads the blob itself.
    candidateImageDelivery: new CandidateImageDeliveryService({
      candidateImages: new PrismaCandidateImageReader(prisma),
      images: imageReader,
    }),
    // ── FR-15: the Found-side Claim submission ───────────────────────────
    //
    // **The Claim, the report's status change, and the audit event commit
    // together.** The submission service owns the transaction; the
    // repository and the reader are its ports.
    claims: new ClaimSubmissionService(
      new PrismaClaimRepository(prisma),
      reports,
      new PrismaClaimSubjectReader(prisma),
      new PrismaPendingClaimReader(prisma),
      audit,
      transactions,
      systemClock,
      emails,
      new DefaultNewClaimEmailBuilder(),
      readBaseUrl(env),
    ),
    // ── FR-16, FR-17, FR-18, FR-22: the administrator's claim decisions ──
    //
    // **The decision service owns the transaction, and the row lock lives
    // inside it.** The lock is taken on the Found *report* — the shared
    // resource — so two administrators deciding two different Claims on the
    // same item are serialised, and only the first commits.
    claimReviews: new ClaimReviewService(new PrismaClaimReviewReader(prisma)),
    claimDecisions: new ClaimDecisionService(
      new PrismaClaimDecisionReader(prisma),
      new PrismaClaimDecisionRepository(prisma),
      reports,
      audit,
      transactions,
      systemClock,
      emails,
      new DefaultClaimDecisionEmailBuilder(),
    ),
    // ── FR-38: the per-Claim thread ──────────────────────────────────────
    //
    // **The message and the audit event commit together.** The service owns
    // the transaction; the repository and the reader are its ports. The
    // thread's participants — the claimant, the finder, and the
    // administrator — are decided by the domain, and the service supplies
    // the facts.
    claimThreads: new ClaimThreadService(
      new PrismaClaimThreadReader(prisma),
      new PrismaClaimThreadRepository(prisma),
      audit,
      transactions,
    ),
    // ── FR-40 and FR-44: the Lost-side Recovery Response submission ─────
    //
    // **The Response and its audit event commit together.** The submission
    // service owns the transaction; the repository and the reader are its
    // ports.
    //
    // **The candidate image is stored before the row, and compensated after
    // a failure** — the image-handling §5 shape, shared with the report's
    // own write path. The blob is not in the PostgreSQL transaction and
    // cannot be, so the ordering is what delivers "a failed image means no
    // response".
    //
    // **The Lost-side event factory owns the event's shape.** Event 15's
    // payload names the exact place and the observed identifying details as
    // catalog fields, and the factory is the single place that knows it.
    recoveryResponses: new RecoveryResponseSubmissionService(
      new PrismaRecoveryResponseRepository(prisma),
      new PrismaRecoveryResponseReader(prisma),
      new PrismaRecoveryResponseSubjectReader(prisma),
      campusAreas,
      audit,
      transactions,
      systemClock,
      new LostSideEventFactory(audit),
      images,
      emails,
      new DefaultNewRecoveryResponseEmailBuilder(),
      readBaseUrl(env),
    ),
    // ── FR-43: the owner's provisional selection ──────────────────────────
    //
    // **The response's move, the report's move, and the two audit events
    // commit together.** The selection service owns the transaction; the
    // selection repository and the Lost-report subject reader are its ports.
    //
    // **The partial unique index is the rule.** The service's read-and-refuse
    // check is the explanation; the index is what makes two concurrent
    // selections resolve to exactly one commit.
    recoveryResponseSelections: new RecoveryResponseSelectionService(
      new PrismaLostReportSubjectReader(prisma),
      new PrismaRecoveryResponseSelectionRepository(prisma),
      audit,
      transactions,
      new LostSideEventFactory(audit),
    ),
    // ── FR-43: the owner's determination, recorded by an administrator ────
    //
    // **The two actors are kept apart in the wiring too.** The service is
    // given the *actor's* administrator capability, resolved once at the
    // `ActorContext` boundary — the service does not read the account and
    // does not write its own role check.
    recoveryResponseDeterminations: new RecoveryResponseDeterminationService(
      new PrismaLostReportSubjectReader(prisma),
      new PrismaRecoveryResponseSelectionRepository(prisma),
      audit,
      transactions,
      new LostSideEventFactory(audit),
      emails,
      new DefaultRecoveryResponseDeterminationEmailBuilder(),
      new PrismaRecoveryResponseResponderReader(prisma),
    ),
    // ── FR-47: the per-Recovery-Response thread ───────────────────────────
    //
    // **The message and the audit event commit together.** The service owns
    // the transaction; the repository and the reader are its ports.
    //
    // **The thread's participants are decided by the domain,** and the
    // service supplies the facts — the responder, the Lost-report owner, and
    // the administrator flag. The parent report's *other* responses'
    // responders are never among them, which is what makes the isolation a
    // rule rather than a convention.
    recoveryResponseThreads: new RecoveryResponseThreadService(
      new PrismaRecoveryResponseThreadReader(prisma),
      new PrismaRecoveryResponseThreadRepository(prisma),
      audit,
      transactions,
      new LostSideEventFactory(audit),
    ),
    // ── FR-40: the responder's own withdrawal ─────────────────────────────
    //
    // **The conditional write and the event commit together.** The
    // withdrawal service owns the transaction; the repository is its port.
    //
    // **The service does not hold a report port at all.** A withdrawn
    // response leaves the Lost report's status untouched, and the isolation
    // is structural — there is no code path that could touch it.
    recoveryResponseWithdrawals: new RecoveryResponseWithdrawalService(
      new PrismaRecoveryResponseWithdrawalRepository(prisma),
      audit,
      transactions,
      new LostSideEventFactory(audit),
    ),
    // ── FR-23, FR-24, FR-25: the administrator's Confirm Returned ──────────
    //
    // **One service, both directions.** The reader resolves the report's
    // type, status, owner, and approved claimant; the repository makes the
    // conditional move that lets exactly one of two concurrent
    // confirmations commit; and the audit event lands inside the same
    // transaction as both.
    returnConfirmations,
    // ── FR-45: the Lost-side Returned closeout ────────────────────────────
    //
    // **The notifications go out after the commit,** and the dispatcher is
    // the only place a Lost-side email is sent from. The event-8 gate is
    // evaluated by the domain, not assumed by the service.
    lostReportCloseouts,
    // ── FR-21: the administrator's Lost-side close ────────────────────────
    //
    // **No email sender is passed.** FR-30 forbids a closure email to any
    // responder, and the service takes no sender at all — so it *cannot*
    // send one.
    lostReportCloses: new LostReportCloseService(
      new PrismaLostReportCloseoutReader(prisma),
      new PrismaLostReportCloseoutRepository(prisma),
      new LostSideEventFactory(audit),
      transactions,
    ),
    // ── FR-36: the administrator's content removal ────────────────────────
    contentRemovals: new ContentRemovalService(
      new PrismaContentRemovalRepository(prisma),
      audit,
      transactions,
    ),
    // ── The rate limiter ──────────────────────────────────────────────────
    //
    // **The same shared port the identity routes use** (ADR-15). The counter
    // lives in the database, not in memory, because the runtime is
    // horizontally scaled and ephemeral.
    rateLimiter: new DatabaseRateLimiter(prisma),
    rateLimits: readListingsRateLimitConfig(env),
  };
}
