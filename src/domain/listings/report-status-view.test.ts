/**
 * The status view suite — the type-aware status sets and the default view.
 *
 * **`Verification Pending` is the status most likely to be wrongly
 * excluded.** It is an *active* Lost-side intermediate status, not a
 * terminal one, and three separate acceptance criteria in the PRD call it
 * out by name. These tests assert it is present in the default view, and
 * that it is a Lost status only.
 */

import { describe, expect, it } from 'vitest';

import {
  administratorStatusView,
  defaultStatusView,
  defaultStatusViewFor,
  resolveStatusView,
  statusAvailableForType,
  statusesForType,
  FOUND_STATUSES,
  LOST_STATUSES,
} from './report-status-view';

describe('the status sets', () => {
  it('gives a Found report the PRD’s five statuses', () => {
    expect(FOUND_STATUSES).toEqual([
      'Open',
      'Claim Requested',
      'Claim Approved',
      'Returned',
      'Closed',
    ]);
  });

  it('gives a Lost report the PRD’s four statuses', () => {
    expect(LOST_STATUSES).toEqual([
      'Open',
      'Verification Pending',
      'Returned',
      'Closed',
    ]);
  });

  it('keeps Verification Pending out of the Found set', () => {
    expect(FOUND_STATUSES).not.toContain('Verification Pending');
  });

  it('keeps the Claim statuses out of the Lost set', () => {
    expect(LOST_STATUSES).not.toContain('Claim Requested');
    expect(LOST_STATUSES).not.toContain('Claim Approved');
  });
});

describe('status availability', () => {
  it('allows every Found status on a Found report', () => {
    for (const status of FOUND_STATUSES) {
      expect(statusAvailableForType(status, 'Found')).toBe(true);
    }
  });

  it('allows every Lost status on a Lost report', () => {
    for (const status of LOST_STATUSES) {
      expect(statusAvailableForType(status, 'Lost')).toBe(true);
    }
  });

  it('refuses Verification Pending on a Found report', () => {
    // **Story 009 names this exact combination as invalid.** It is not an
    // empty result — it is a combination that cannot exist.
    expect(statusAvailableForType('Verification Pending', 'Found')).toBe(false);
  });

  it('refuses the Claim statuses on a Lost report', () => {
    expect(statusAvailableForType('Claim Requested', 'Lost')).toBe(false);
    expect(statusAvailableForType('Claim Approved', 'Lost')).toBe(false);
  });

  it('resolves the set from the type', () => {
    expect(statusesForType('Found')).toBe(FOUND_STATUSES);
    expect(statusesForType('Lost')).toBe(LOST_STATUSES);
  });
});

describe('the default status view', () => {
  it('excludes the two terminal statuses', () => {
    expect(defaultStatusView()).not.toContain('Returned');
    expect(defaultStatusView()).not.toContain('Closed');
  });

  it('includes Verification Pending', () => {
    // **The status most likely to be wrongly dropped.** It means *something
    // is in progress*, and dropping it would hide every Lost report whose
    // recovery is under way.
    expect(defaultStatusView()).toContain('Verification Pending');
  });

  it('includes the three Found-side active statuses', () => {
    expect(defaultStatusView()).toContain('Open');
    expect(defaultStatusView()).toContain('Claim Requested');
    expect(defaultStatusView()).toContain('Claim Approved');
  });

  it('holds every status a member sees, and more', () => {
    // **The administrator's view is a superset of the member's.** The
    // member's default excludes the two terminal statuses; the
    // administrator's includes them and everything else.
    for (const status of defaultStatusView()) {
      expect(administratorStatusView()).toContain(status);
    }

    expect(administratorStatusView().length).toBeGreaterThan(defaultStatusView().length);
  });

  it('includes the terminal statuses for an administrator', () => {
    expect(administratorStatusView()).toContain('Returned');
    expect(administratorStatusView()).toContain('Closed');
  });
});

describe('the default view per partition', () => {
  it('keeps the terminal statuses retrievable in mine', () => {
    // **FR-49 says the owner sees their own reports across the whole
    // lifecycle, including Returned and Closed.**
    const view = defaultStatusViewFor('mine', false);

    expect(view).toContain('Returned');
    expect(view).toContain('Closed');
  });

  it('excludes the terminal statuses in browse for a non-administrator', () => {
    const view = defaultStatusViewFor('browse', false);

    expect(view).not.toContain('Returned');
    expect(view).not.toContain('Closed');
  });

  it('includes the terminal statuses in browse for an administrator', () => {
    const view = defaultStatusViewFor('browse', true);

    expect(view).toContain('Returned');
    expect(view).toContain('Closed');
  });

  it('gives the public partition the non-administrator view', () => {
    // **The anonymous listing excludes the terminal statuses by default**,
    // and the public partition has no administrator to widen it.
    const view = defaultStatusViewFor('public', false);

    expect(view).not.toContain('Returned');
    expect(view).not.toContain('Closed');
  });
});

describe('resolving the status view', () => {
  it('uses the default view when no filter is given', () => {
    expect(resolveStatusView('browse', false, null)).toEqual(defaultStatusView());
  });

  it('uses an explicit filter exactly, without widening it', () => {
    // **The caller’s filter is the filter.** The default view must not
    // reappear underneath it.
    const requested = ['Open', 'Closed'] as const;

    expect(resolveStatusView('browse', false, requested)).toEqual(requested);
  });

  it('lets an explicit filter include the terminal statuses for a member', () => {
    // **The default is a default, not a limit.** The member opts in.
    const requested = ['Closed'] as const;

    expect(resolveStatusView('browse', false, requested)).toEqual(['Closed']);
  });

  it('keeps every status in mine regardless of the filter', () => {
    expect(resolveStatusView('mine', false, ['Open'])).toEqual(administratorStatusView());
  });
});
