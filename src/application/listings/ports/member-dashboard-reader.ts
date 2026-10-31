/** Summary counts for the member dashboard (mockup `07-dashboard.html`). */
export interface MemberDashboardStats {
  readonly openReports: number;
  readonly pendingClaims: number;
  readonly approvedClaims: number;
  readonly returnedItems: number;
  /** Submitted RRs on the member's own Open Lost reports (actionable to review). */
  readonly responsesToReview: number;
}

export interface MemberDashboardReader {
  readForMember(memberId: string): Promise<MemberDashboardStats>;
}
