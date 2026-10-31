/** Claim counts for one report on the My reports table. */
export interface ReportClaimSummary {
  readonly approved: number;
  readonly pending: number;
  readonly rejected: number;
}
