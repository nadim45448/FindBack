import { prisma } from '@/infrastructure/db/prisma';

/** Report id for a Claim, or null when the Claim does not exist. */
export async function reportIdForClaim(claimId: string): Promise<string | null> {
  const row = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { reportId: true },
  });

  return row?.reportId ?? null;
}

/** Report id for a Recovery Response, or null when it does not exist. */
export async function reportIdForRecoveryResponse(responseId: string): Promise<string | null> {
  const row = await prisma.recoveryResponse.findUnique({
    where: { id: responseId },
    select: { reportId: true },
  });

  return row?.reportId ?? null;
}
