import type { PrismaClient } from '@prisma/client';

import type {
  MemberDashboardReader,
  MemberDashboardStats,
} from '@/application/listings/ports/member-dashboard-reader';

/**
 * Dashboard stat counts — mirrors mockup `getDashboardStats`.
 */
export class PrismaMemberDashboardReader implements MemberDashboardReader {
  constructor(private readonly prisma: PrismaClient) {}

  async readForMember(memberId: string): Promise<MemberDashboardStats> {
    const [openReports, pendingClaims, approvedClaims, returnedItems, responsesToReview] =
      await Promise.all([
        this.prisma.report.count({
          where: { reporterId: memberId, status: 'Open' },
        }),
        this.prisma.claim.count({
          where: { claimantId: memberId, status: 'Pending' },
        }),
        this.prisma.claim.count({
          where: { claimantId: memberId, status: 'Approved' },
        }),
        this.prisma.report.count({
          where: { reporterId: memberId, status: 'Returned' },
        }),
        this.prisma.recoveryResponse.count({
          where: {
            status: 'Submitted',
            report: { reporterId: memberId, type: 'Lost', status: 'Open' },
          },
        }),
      ]);

    return { openReports, pendingClaims, approvedClaims, returnedItems, responsesToReview };
  }
}
