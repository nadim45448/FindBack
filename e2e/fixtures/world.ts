/**
 * Fixed E2E fixture ids — must stay in sync with `scripts/e2e-seed.ts`.
 */
export const E2E_WORLD = {
  member2Email: 'member2@findback.test',

  foundOpenReportId: 'e2e00002-0002-4002-8002-000000000002',
  foundOpenReportName: 'E2E Found Wallet',

  foundClaimRequestedReportId: 'e2e00003-0003-4003-8003-000000000003',
  foundClaimRequestedReportName: 'E2E Found Phone',

  pendingClaimId: 'e2e00004-0004-4004-8004-000000000004',

  foundAwaitingReturnReportId: 'e2e00005-0005-4005-8005-000000000005',
  foundAwaitingReturnReportName: 'E2E Found Bag Awaiting Return',

  lostOpenReportId: 'e2e00006-0006-4006-8006-000000000006',
  lostOpenReportName: 'E2E Lost Jacket',

  lostVerificationReportId: 'e2e00007-0007-4007-8007-000000000007',
  lostVerificationReportName: 'E2E Lost Keys Verify',

  recoverySelectedResponseId: 'e2e00008-0008-4008-8008-000000000008',

  returnedReportId: 'e2e00009-0009-4009-8009-000000000009',
  returnedReportName: 'E2E Returned Umbrella',

  returnedApprovedClaimId: 'e2e0000a-000a-400a-800a-00000000000a',
} as const;
