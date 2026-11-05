import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import {
  AdminVerificationSurface,
  type VerificationCandidate,
  type VerificationReportSummary,
} from '@/ui/admin-verification-surface';
import { contextualAuditHref } from '@/ui/admin-contextual-audit-href';
import { VERIFICATION_REVIEW_HEADING } from '@/ui/admin-copy';

import { prisma } from '@/infrastructure/db/prisma';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import type { ActorContext } from '@/domain/accounts';

import { loadRecoveryResponsesForAdminVerification } from '../_recovery-responses-for-verification';

import { readContextualReportAuditTrail } from '../../_audit-page';
import { buildAdminStack, resolveAdminAccess } from '../../_admin-page';
import { formatTimestamp } from '../../_queue-page';

export const metadata: Metadata = {
  title: 'Verification review',
};

/**
 * The Lost-side verification screen — `/admin/lost/:id` (FR-45).
 */
export default async function LostVerificationPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/verifications" />;
  }

  const { id } = await params;

  const [context, candidates, auditResult] = await Promise.all([
    readVerificationContext(id, access.userId),
    readCandidates(id, access.userId, access.displayName),
    readContextualReportAuditTrail(id, 'Lost', access.userId),
  ]);

  if (context === null) {
    return (
      <div className="admin-console">
        <h1 className="hero__title">{VERIFICATION_REVIEW_HEADING}</h1>

        <div className="banner banner--info" role="status">
          <p>Something went wrong on our side. Try again, or come back in a moment.</p>
        </div>
      </div>
    );
  }

  const surfaceKey = candidates.map((c) => `${c.responseId}:${c.status}`).join('|');

  return (
    <AdminVerificationSurface
      key={surfaceKey || id}
      reportId={id}
      determinedByUserId={context.ownerUserId}
      summary={context.summary}
      candidates={candidates}
      afterHref="/admin/verifications"
      auditHref={contextualAuditHref('Lost', id)}
      auditTrail={{
        rows: auditResult.rows,
        hasMore: auditResult.hasMore,
        error: auditResult.error,
      }}
    />
  );
}

interface VerificationContext {
  readonly ownerUserId: string;
  readonly summary: VerificationReportSummary;
}

function formatReportDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(value);
}

async function readVerificationContext(
  reportId: string,
  userId: string,
): Promise<VerificationContext | null> {
  try {
    const stack = buildAdminStack();
    const queue = await stack.queues.read({ userId, isAdministrator: true }, 'verifications');

    let ownerDisplayName: string | null = null;
    let ownerUserId: string | null = null;
    let verificationStartedLabel: string | null = null;
    let reportNameFromQueue: string | null = null;

    if (queue.queue === 'verifications') {
      const row = queue.rows.find((candidate) => candidate.reportId === reportId);

      if (row) {
        ownerDisplayName = row.ownerDisplayName;
        ownerUserId = row.ownerUserId;
        reportNameFromQueue = row.reportName;
        verificationStartedLabel = formatTimestamp(row.verificationStartedAt);
      }
    }

    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        type: 'Lost',
        status: 'Verification Pending',
      },
      select: {
        name: true,
        category: true,
        campusArea: true,
        date: true,
        reporterId: true,
        reporter: { select: { displayName: true } },
      },
    });

    if (!report) {
      return null;
    }

    const resolvedOwnerId = ownerUserId ?? report.reporterId;
    const resolvedOwnerName =
      ownerDisplayName ?? report.reporter.displayName ?? 'Report owner';

    const summary: VerificationReportSummary = {
      name: reportNameFromQueue ?? report.name,
      category: report.category,
      campusArea: report.campusArea,
      dateLabel: formatReportDate(report.date),
      ownerDisplayName: resolvedOwnerName,
      verificationStartedLabel,
    };

    return { ownerUserId: resolvedOwnerId, summary };
  } catch {
    return null;
  }
}

async function readCandidates(
  reportId: string,
  userId: string,
  displayName: string | null,
): Promise<readonly VerificationCandidate[]> {
  const mapCandidate = (
    response: Omit<VerificationCandidate, 'submittedAtLabel'> & { submittedAt: string },
  ): VerificationCandidate => ({
    ...response,
    submittedAtLabel: formatTimestamp(new Date(response.submittedAt)),
  });

  try {
    const stack = buildListingsStack();
    const actor: ActorContext = {
      actorId: userId,
      status: 'Active',
      isAdministrator: true,
      displayName: displayName ?? 'Administrator',
      capability: 'member',
    };

    const projection = await stack.details.show(actor, reportId);

    const fromProjection = projection.recoveryResponses.map((response) =>
      mapCandidate({
        responseId: response.responseId,
        status: response.status,
        campusArea: response.campusArea ?? '',
        exactPlace: response.whereFoundExactPlace ?? '',
        observedIdentifyingDetails: response.observedIdentifyingDetails ?? '',
        dateFound: response.dateFound ?? '',
        submittedAt: response.submittedAt,
        hasCandidateImage: response.candidateImageRef !== undefined,
      }),
    );

    if (fromProjection.length > 0) {
      return enrichCandidateImageFlags(reportId, fromProjection);
    }

    return loadRecoveryResponsesForAdminVerification(reportId);
  } catch {
    return loadRecoveryResponsesForAdminVerification(reportId);
  }
}

/**
 * The visibility projection omits `candidateImageRef` when null; the image
 * route still needs a boolean on the admin screen.
 */
async function enrichCandidateImageFlags(
  reportId: string,
  candidates: readonly VerificationCandidate[],
): Promise<readonly VerificationCandidate[]> {
  const needsLookup = candidates.some((candidate) => !candidate.hasCandidateImage);

  if (!needsLookup) {
    return candidates;
  }

  const rows = await prisma.recoveryResponse.findMany({
    where: { reportId },
    select: { id: true, candidateImageRef: true },
  });

  const imageByResponseId = new Map(
    rows.map((row) => [row.id, Boolean(row.candidateImageRef)] as const),
  );

  return candidates.map((candidate) => ({
    ...candidate,
    hasCandidateImage:
      candidate.hasCandidateImage || (imageByResponseId.get(candidate.responseId) ?? false),
  }));
}
