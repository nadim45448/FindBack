/**
 * The partition suite — FR-49's four disjoint views.
 *
 * **The disjointness is the property worth testing.** A report a member
 * authored appears in `mine` and must never appear in their own `browse`;
 * a Claim they submitted appears in `claims` and nowhere else. The tests
 * assert that the *rules* produce the disjointness, not that a particular
 * query happens to filter correctly — because a query that filters
 * correctly today is not a guarantee that a new one will.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ANONYMOUS_PARTITION,
  DEFAULT_MEMBER_PARTITION,
  MEMBER_PARTITIONS,
  REPORT_PARTITIONS,
  isReportPartition,
  participationKindFor,
  partitionsOverAllReports,
  partitionsOverOtherReports,
  partitionsOverOwnReports,
  partitionsOverParticipation,
} from './report-partition';

describe('the partition set', () => {
  it('names the five accepted values', () => {
    expect(REPORT_PARTITIONS).toEqual([
      'mine',
      'browse',
      'claims',
      'recovery_responses',
      'public',
    ]);
  });

  it('accepts exactly those five', () => {
    for (const partition of REPORT_PARTITIONS) {
      expect(isReportPartition(partition)).toBe(true);
    }
  });

  it('refuses anything else', () => {
    expect(isReportPartition('My Reports')).toBe(false);
    expect(isReportPartition('recoveryresponses')).toBe(false);
    expect(isReportPartition('')).toBe(false);
  });

  it('gives a member four partitions, and the public one is not one of them', () => {
    expect(MEMBER_PARTITIONS).toEqual([
      'mine',
      'browse',
      'claims',
      'recovery_responses',
    ]);
    expect(MEMBER_PARTITIONS).not.toContain('public');
  });
});

describe('the default partition', () => {
  it('is browse for an authenticated request', () => {
    // **Not `mine`.** The default must be the one that cannot expose a
    // member to themselves by accident.
    expect(DEFAULT_MEMBER_PARTITION).toBe('browse');
  });

  it('is public for an anonymous request', () => {
    expect(DEFAULT_ANONYMOUS_PARTITION).toBe('public');
  });
});

describe('what each partition enumerates', () => {
  it('enumerates the viewer’s own reports only in mine', () => {
    expect(partitionsOverOwnReports('mine')).toBe(true);
    expect(partitionsOverOwnReports('browse')).toBe(false);
    expect(partitionsOverOwnReports('claims')).toBe(false);
    expect(partitionsOverOwnReports('recovery_responses')).toBe(false);
    expect(partitionsOverOwnReports('public')).toBe(false);
  });

  it('enumerates other members’ reports only in browse', () => {
    expect(partitionsOverOtherReports('browse')).toBe(true);
    expect(partitionsOverOtherReports('mine')).toBe(false);
    expect(partitionsOverOtherReports('claims')).toBe(false);
    expect(partitionsOverOtherReports('recovery_responses')).toBe(false);
    expect(partitionsOverOtherReports('public')).toBe(false);
  });

  it('enumerates participation in claims and recovery_responses', () => {
    expect(partitionsOverParticipation('claims')).toBe(true);
    expect(partitionsOverParticipation('recovery_responses')).toBe(true);
    expect(partitionsOverParticipation('mine')).toBe(false);
    expect(partitionsOverParticipation('browse')).toBe(false);
    expect(partitionsOverParticipation('public')).toBe(false);
  });
});

describe('the participation kind', () => {
  it('is a claim for the claims partition', () => {
    expect(participationKindFor('claims')).toBe('claim');
  });

  it('is a recovery response for the recovery_responses partition', () => {
    expect(participationKindFor('recovery_responses')).toBe('recoveryResponse');
  });

  it('is null for the partitions that do not enumerate participation', () => {
    expect(participationKindFor('mine')).toBeNull();
    expect(participationKindFor('browse')).toBeNull();
    expect(participationKindFor('public')).toBeNull();
  });
});

describe('the disjointness', () => {
  it('gives every member partition exactly one kind', () => {
    // **A member partition is either the own reports, the other reports, or
    // the participation — never two.** If a partition could be two kinds at
    // once, the disjointness would be a convention rather than a property.
    //
    // **`public` is excluded, deliberately.** It is the unpartitioned
    // listing, and it overlaps both report partitions by design.
    for (const partition of MEMBER_PARTITIONS) {
      const kinds = [
        partitionsOverOwnReports(partition),
        partitionsOverOtherReports(partition),
        partitionsOverParticipation(partition),
      ].filter(Boolean);

      expect(kinds).toHaveLength(1);
    }
  });

  it('gives public its own kind', () => {
    // **The public listing spans all members' reports**, so it is neither
    // the own-reports partition nor the other-reports partition.
    expect(partitionsOverAllReports('public')).toBe(true);
    expect(partitionsOverOwnReports('public')).toBe(false);
    expect(partitionsOverOtherReports('public')).toBe(false);
    expect(partitionsOverParticipation('public')).toBe(false);
  });

  it('never puts a report in both mine and browse', () => {
    // **The own-reports and other-reports partitions are complementary.**
    // A report's reporter is either the viewer or it is not — there is no
    // third case, which is what makes the two disjoint.
    expect(partitionsOverOwnReports('mine')).toBe(true);
    expect(partitionsOverOtherReports('mine')).toBe(false);

    expect(partitionsOverOtherReports('browse')).toBe(true);
    expect(partitionsOverOwnReports('browse')).toBe(false);
  });

  it('never puts a report in a participation partition and a report partition', () => {
    // **The participation partitions enumerate participation records, not
    // reports.** A Claim the member submitted is not a report.
    expect(partitionsOverParticipation('claims')).toBe(true);
    expect(partitionsOverOwnReports('claims')).toBe(false);
    expect(partitionsOverOtherReports('claims')).toBe(false);

    expect(partitionsOverParticipation('recovery_responses')).toBe(true);
    expect(partitionsOverOwnReports('recovery_responses')).toBe(false);
    expect(partitionsOverOtherReports('recovery_responses')).toBe(false);
  });
});
