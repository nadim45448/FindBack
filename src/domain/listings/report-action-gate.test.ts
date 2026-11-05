import { describe, expect, it } from 'vitest';

import { shouldShowReporterToolbar } from './report-action-gate';

describe('the reporter toolbar on item detail', () => {
  it('hides the bar when the report is terminal', () => {
    expect(shouldShowReporterToolbar('Returned')).toBe(false);
    expect(shouldShowReporterToolbar('Closed')).toBe(false);
  });

  it('shows the bar while the report is still in flight', () => {
    expect(shouldShowReporterToolbar('Open')).toBe(true);
    expect(shouldShowReporterToolbar('Claim Requested')).toBe(true);
    expect(shouldShowReporterToolbar('Verification Pending')).toBe(true);
  });
});
