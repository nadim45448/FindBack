import { describe, expect, it } from 'vitest';

import {
  displayReportStatus,
  LOST_REPORT_AWAITING_RETURN_STATUS,
  reportHasMatchConfirmed,
} from './report-display-status';

describe('displayReportStatus', () => {
  it('shows Awaiting return after match confirmed while stored status stays Verification Pending', () => {
    expect(
      displayReportStatus('Lost', 'Verification Pending', { hasMatchConfirmed: true }),
    ).toBe(LOST_REPORT_AWAITING_RETURN_STATUS);
  });

  it('keeps Verification Pending before match confirmed', () => {
    expect(
      displayReportStatus('Lost', 'Verification Pending', { hasMatchConfirmed: false }),
    ).toBe('Verification Pending');
  });
});

describe('reportHasMatchConfirmed', () => {
  it('is true when any response is Match Confirmed', () => {
    expect(
      reportHasMatchConfirmed([
        { status: 'Submitted' },
        { status: 'Match Confirmed' },
      ]),
    ).toBe(true);
  });
});
