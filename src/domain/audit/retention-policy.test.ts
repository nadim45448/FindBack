import { describe, expect, it } from 'vitest';

import { decideRetention, isHardDeletable } from './retention-policy';

/**
 * Retention follows the parent entity's rule (PRD §10). The FR-10 hard delete
 * is the only removal path in the system.
 */
describe('retention policy', () => {
  it('removes the trail with an interaction-free Open report', () => {
    const decision = decideRetention('report', 'Open', true);

    expect(decision.action).toBe('removeWithParent');
  });

  it('retains the trail of a report that has an interaction', () => {
    expect(decideRetention('report', 'Open', false).action).toBe('retain');
  });

  it('retains the trail of a Returned report', () => {
    expect(decideRetention('report', 'Returned', false).action).toBe('retain');
  });

  it('retains the trail of a Closed report', () => {
    expect(decideRetention('report', 'Closed', false).action).toBe('retain');
  });

  it('retains the trail of a Claim Requested report', () => {
    expect(decideRetention('report', 'Claim Requested', false).action).toBe('retain');
  });

  it('retains an account trail indefinitely', () => {
    expect(decideRetention('account', 'Open', true).action).toBe('retain');
  });
});

describe('FR-10 hard-delete eligibility', () => {
  it('allows an Open report with no Claim and no Recovery Response', () => {
    expect(isHardDeletable('Open', false, false)).toBe(true);
  });

  it('refuses an Open report that has a Claim', () => {
    expect(isHardDeletable('Open', true, false)).toBe(false);
  });

  it('refuses an Open report that has a Recovery Response', () => {
    expect(isHardDeletable('Open', false, true)).toBe(false);
  });

  it('refuses a report that is not Open, even with no interaction', () => {
    expect(isHardDeletable('Claim Requested', false, false)).toBe(false);
    expect(isHardDeletable('Returned', false, false)).toBe(false);
    expect(isHardDeletable('Closed', false, false)).toBe(false);
  });
});
