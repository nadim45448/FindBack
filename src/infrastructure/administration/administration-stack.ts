/**
 * The administrator surface's composition root.
 *
 * **One place where the concrete implementations are wired together.** The
 * route handlers and the pages depend on the use cases, and the use cases
 * depend on the ports — so this is the only module that knows both sides.
 *
 * ## The stack is separate from the listings stack on purpose
 *
 * The administrator's dashboard and queues **read** the reports, Claims,
 * Recovery Responses, and accounts that the domain units own; they do not
 * write them. A separate stack makes that boundary visible: this stack has
 * no write port at all, and nothing in it can change a report's status, a
 * Claim's decision, or an account's state.
 *
 * ## The audit trail's read is composed, not reimplemented
 *
 * Unit 006 owns the trail's read, its authorisation, and the read record
 * PRD §10 requires. This stack **composes** that service rather than
 * writing a second reader — a second answer to "may this administrator
 * read the trail, and was the read recorded?" would be a second place for
 * the two to disagree.
 *
 * ## There is no `listAll`
 *
 * **There is no global audit read here.** The contextual query is the only
 * audit surface, because §17.1 makes audit contextual:
 * `/admin/items/:id/audit` and `/admin/lost/:id/audit`, and nothing else.
 */

import { AuditReadRecorder } from '@/application/audit-read-recorder';
import { AuditTrailReader } from '@/application/audit-trail-reader';
import { AuditTrailService } from '@/application/audit-trail-service';
import {
  AdministratorDashboardQuery,
  AdministratorQueueQuery,
  ContextualAuditQuery,
  StorageUsageQuery,
} from '@/application/administration';

import { PrismaAuditEventRepository } from '@/infrastructure/audit/prisma-audit-event-repository';
import { PrismaAuditReadLogRepository } from '@/infrastructure/audit/prisma-audit-read-log-repository';
import { PrismaTransactionFactory } from '@/infrastructure/db/prisma-transaction-factory';
import { prisma } from '@/infrastructure/db/prisma';
import { BlobImageQuotaReader } from '@/infrastructure/listings/blob-image-quota-reader';
import { PrismaAdministratorQueueReader } from '@/infrastructure/listings/prisma-administrator-queue-reader';

import { PrismaAdministrationContextReader } from './prisma-administration-context-reader';

/**
 * The administrator surface's wiring.
 */
export interface AdministrationStack {
  /** FR-33 — the dashboard's four counts. */
  readonly dashboard: AdministratorDashboardQuery;
  /** §15.2–§15.5 — the four operational queues. */
  readonly queues: AdministratorQueueQuery;
  /** §17 — the contextual audit trail. */
  readonly audit: ContextualAuditQuery;
  /**
   * image-handling §4 — the administrator's view of the blob storage budget.
   *
   * **The read side of the same budget the write paths enforce.** The quota
   * reader is the *same* adapter the report-creation and administrator-edit
   * paths use — so the number the administrator sees and the number an
   * upload is measured against come from the same source, and the warning
   * bands and the refusal cannot disagree.
   */
  readonly storage: StorageUsageQuery;
  /**
   * The surfaces' context — the actor display names and the report name.
   *
   * **A read-only collaborator, not a use case.** It resolves names for
   * rows the trail already returned; it has no authorisation of its own,
   * because it is only ever reached after the use case has refused a
   * non-administrator.
   */
  readonly context: PrismaAdministrationContextReader;
}

/**
 * Build the administrator surface's stack.
 *
 * **The queue reader is one adapter for all four queues.** The four queues
 * differ in their *filter*, not in their read — and one adapter means one
 * place where a filter becomes SQL, so the dashboard's count and the
 * queue's rows are drawn from the same code path.
 */
export function buildAdministrationStack(): AdministrationStack {
  const transactions = new PrismaTransactionFactory(prisma);

  const auditEvents = new PrismaAuditEventRepository(prisma);
  const auditReads = new PrismaAuditReadLogRepository(prisma);

  // **The trail service is Unit 006's,** composed rather than reimplemented.
  // The read record is written in its own transaction, after the read, and a
  // failed record is logged rather than propagated — PRD §10's rule, and
  // Unit 006's, not this bolt's.
  const trail = new AuditTrailService(
    new AuditTrailReader(auditEvents),
    new AuditReadRecorder(auditReads),
    transactions,
  );

  const queueReader = new PrismaAdministratorQueueReader(prisma);

  return {
    dashboard: new AdministratorDashboardQuery(queueReader),
    queues: new AdministratorQueueQuery(queueReader),
    audit: new ContextualAuditQuery(trail),
    storage: new StorageUsageQuery(new BlobImageQuotaReader()),
    context: new PrismaAdministrationContextReader(prisma),
  };
}
