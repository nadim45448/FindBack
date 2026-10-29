/**
 * The Prisma implementation of the report interaction reader.
 *
 * **It answers the gate's question in one round trip.** The four facts are
 * four counts, and they are read together because the gate needs all of them
 * to decide: a Found report's gate reads `hasClaim`, a Lost report's reads
 * `hasRecoveryResponse`, and the withdrawal's gate reads `hasApprovedClaim`
 * and `hasMatchConfirmed` as well.
 *
 * **It reads existence, not activity.** A rejected Claim is a terminal
 * Claim, and its existence still blocks a hard delete — the same holds for a
 * terminal Recovery Response. So the counts are over *all* rows, not over
 * the live ones.
 *
 * **The counts are `Int`, not booleans.** The port's contract says the
 * absence of an interaction must be distinguishable from "the question was
 * not asked", and a count does that where a boolean cannot.
 *
 * Pure infrastructure — the only I/O in this module is the two reads.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { ReportInteractionReader } from '@/application/listings/ports/report-interaction-reader';
import type {
  InteractionFacts,
  NonTerminalRecoveryResponseToResolve,
  PendingClaimToReject,
} from '@/domain/listings';

/** The Prisma report interaction reader. */
export class PrismaReportInteractionReader implements ReportInteractionReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the interaction facts for a report.
   *
   * **One query, four counts.** The counts are issued as a single grouped
   * query so the four facts are read from the same snapshot — a report
   * whose Claim was created between two separate reads would produce
   * contradictory facts, and the gate would be deciding on a state that
   * never existed.
   */
  async read(reportId: string): Promise<InteractionFacts> {
    const [claims, responses] = await Promise.all([
      this.client.claim.groupBy({
        by: ['status'],
        where: { reportId },
        _count: { _all: true },
      }),
      this.client.recoveryResponse.groupBy({
        by: ['status'],
        where: { reportId },
        _count: { _all: true },
      }),
    ]);

    const claimCounts = new Map(claims.map((row) => [row.status, row._count._all]));
    const responseCounts = new Map(
      responses.map((row) => [row.status, row._count._all]),
    );

    return {
      hasClaim: totalOf(claimCounts) > 0,
      hasRecoveryResponse: totalOf(responseCounts) > 0,
      hasApprovedClaim: (claimCounts.get('Approved') ?? 0) > 0,
      hasMatchConfirmed: (responseCounts.get('Match Confirmed') ?? 0) > 0,
    };
  }

  /**
   * Read the Pending Claims on a Found report.
   *
   * **The claimant's address travels with the Claim.** The FR-29
   * notification must reach every affected claimant, and the claim's owner is
   * the only place that knows the address.
   */
  async readPendingClaims(reportId: string): Promise<readonly PendingClaimToReject[]> {
    const claims = await this.client.claim.findMany({
      where: { reportId, status: 'Pending' },
      select: {
        id: true,
        status: true,
        claimant: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return claims.map((claim) => ({
      claimId: claim.id,
      claimStatus: claim.status as PendingClaimToReject['claimStatus'],
      claimantEmail: claim.claimant.email,
    }));
  }

  /**
   * Read the non-terminal Recovery Responses on a Lost report.
   *
   * **Only the two non-terminal statuses are returned.** A `Match Confirmed`
   * Response is terminal for this purpose — a withdrawal is blocked outright
   * once one exists — and an already-resolved Response must not be resolved
   * a second time.
   */
  async readNonTerminalRecoveryResponses(
    reportId: string,
  ): Promise<readonly NonTerminalRecoveryResponseToResolve[]> {
    const responses = await this.client.recoveryResponse.findMany({
      where: { reportId, status: { in: ['Submitted', 'Selected for Verification'] } },
      select: { id: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    return responses.map((response) => ({
      recoveryResponseId: response.id,
      recoveryResponseStatus:
        response.status as NonTerminalRecoveryResponseToResolve['recoveryResponseStatus'],
    }));
  }
}

/** The sum of a grouped count map. */
function totalOf(counts: ReadonlyMap<string, number>): number {
  let total = 0;

  for (const count of counts.values()) {
    total += count;
  }

  return total;
}

/** The Prisma client type the reader needs. */
export type { Prisma };
