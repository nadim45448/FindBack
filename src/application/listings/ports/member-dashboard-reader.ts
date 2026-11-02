/** Summary counts for the member dashboard (mockup `07-dashboard.html`). */
export interface MemberDashboardStats {
  readonly openReports: number;
  readonly pendingClaims: number;
  readonly approvedClaims: number;
  /** Reports the member authored in `Returned`, plus Found items they received via an approved claim. */
  readonly returnedItems: number;
  /** Reports the member authored that reached `Returned`. */
  readonly returnedAuthoredReports: number;
  /** Approved claims on someone else's Found reports now in `Returned`. */
  readonly returnedReceivedClaims: number;
  /** Submitted RRs on the member's own Open Lost reports (actionable to review). */
  readonly responsesToReview: number;
}

export interface MemberDashboardReader {
  readForMember(memberId: string): Promise<MemberDashboardStats>;
}
