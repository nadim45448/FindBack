/** Summary shown on the confirm-returned admin screen. */
export interface ReturnConfirmationSummary {
  readonly itemName: string;
  readonly reportType: 'Found' | 'Lost';
  readonly defaultReceiverName: string;
  readonly matchedDetails?: readonly { readonly label: string; readonly value: string }[];
}
