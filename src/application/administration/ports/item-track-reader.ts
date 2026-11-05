/**
 * Read models for administrator handoff tracking — returned items and per-report case files.
 *
 * **Not an operational queue.** FR-33's four queues are for work in progress.
 * This port answers "what was returned, to whom, and who else participated?"
 */

/** One row on the returned-items list. */
export interface ReturnedItemRow {
  readonly reportId: string;
  readonly reportType: 'Found' | 'Lost';
  readonly itemName: string;
  readonly reporterDisplayName: string;
  readonly receiverDisplayName: string;
  readonly returnedAt: Date;
}

/** One claim on a Found report's track record. */
export interface ItemTrackClaimRow {
  readonly claimId: string;
  readonly claimantDisplayName: string;
  readonly status: string;
  readonly submittedAt: Date | null;
  readonly decidedAt: Date | null;
  readonly rejectionReason: string | null;
}

/** One recovery response on a Lost report's track record. */
export interface ItemTrackRecoveryResponseRow {
  readonly responseId: string;
  readonly respondentDisplayName: string;
  readonly status: string;
  readonly submittedAt: Date | null;
}

/** The return confirmation when the report is `Returned`. */
export interface ItemTrackReturnConfirmation {
  readonly returnedAt: Date;
  readonly administratorDisplayName: string;
  readonly defaultReceiverDisplayName: string;
  readonly substituteReceiverName: string | null;
  readonly relationship: string | null;
}

/** The assembled case file for one report. */
export interface ItemTrackReading {
  readonly reportId: string;
  readonly reportType: 'Found' | 'Lost';
  readonly itemName: string;
  readonly category: string;
  readonly campusArea: string;
  readonly status: string;
  readonly reporterDisplayName: string;
  readonly returnConfirmation: ItemTrackReturnConfirmation | null;
  readonly claims: readonly ItemTrackClaimRow[];
  readonly recoveryResponses: readonly ItemTrackRecoveryResponseRow[];
}

export interface ItemTrackReader {
  listReturned(limit: number): Promise<readonly ReturnedItemRow[]>;

  readTrack(reportId: string): Promise<ItemTrackReading | null>;
}
