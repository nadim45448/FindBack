/**
 * The per-image delivery rule — who may receive the image's **bytes**.
 *
 * **The load-bearing assertion is that the rule is narrower than the field
 * grant.** A claimant and a recovery responder both hold a column that
 * grants the `image` *field* — the reference appears in their projection —
 * and both are refused the *bytes*. That difference is the whole point of
 * this module, and a test that only checked the owner and the administrator
 * would not notice if it had been widened to match the field grant.
 */

import { describe, expect, it } from 'vitest';

import {
  IMAGE_DELIVERY_COLUMNS,
  grantsImageDelivery,
  mayReceiveImage,
} from './image-delivery';
import { createReportRelationship } from './report-relationship';
import type { ProjectionColumn } from './projection-column';
import type { Viewer } from './viewer';

const REPORTER_ID = '00000000-0000-4000-8000-000000000801';
const VIEWER_ID = '00000000-0000-4000-8000-000000000802';

const ALL_COLUMNS: readonly ProjectionColumn[] = [
  'anonymous',
  'unrelatedMember',
  'foundReportOwner',
  'claimant',
  'recoveryResponder',
  'lostReportOwner',
  'administrator',
];

/** A member viewer. */
function aMember(overrides: Partial<Viewer> = {}): Viewer {
  return {
    kind: 'member',
    accountId: VIEWER_ID,
    isAdministrator: false,
    displayName: 'A Member',
    ...overrides,
  };
}

/** An anonymous viewer. */
function anonymous(): Viewer {
  return {
    kind: 'anonymous',
    accountId: null,
    isAdministrator: false,
    displayName: null,
  };
}

/** The relationship of a viewer who did not author the report. */
function anUnrelatedRelationship(): ReturnType<typeof createReportRelationship> {
  return createReportRelationship({
    reportId: 'report-1',
    reportType: 'Found',
    reporterId: REPORTER_ID,
    viewerId: VIEWER_ID,
  });
}

/** The relationship of the report's author. */
function theAuthorsRelationship(): ReturnType<typeof createReportRelationship> {
  return createReportRelationship({
    reportId: 'report-1',
    reportType: 'Found',
    reporterId: VIEWER_ID,
    viewerId: VIEWER_ID,
  });
}

describe('the image delivery columns', () => {
  it('grants the bytes to the two owner columns and the administrator column', () => {
    expect(IMAGE_DELIVERY_COLUMNS).toEqual([
      'foundReportOwner',
      'lostReportOwner',
      'administrator',
    ]);
  });

  it('does not grant the bytes to the claimant column', () => {
    // **Participation is never permission.** A claimant's projection may
    // carry the image reference; it may not receive the bytes.
    expect(grantsImageDelivery(['unrelatedMember', 'claimant'])).toBe(false);
  });

  it('does not grant the bytes to the recovery responder column', () => {
    // **A responder must not see another candidate's image.**
    expect(grantsImageDelivery(['unrelatedMember', 'recoveryResponder'])).toBe(false);
  });

  it('does not grant the bytes to the unrelated member column', () => {
    expect(grantsImageDelivery(['unrelatedMember'])).toBe(false);
  });

  it('does not grant the bytes to the anonymous column', () => {
    expect(grantsImageDelivery(['anonymous'])).toBe(false);
  });
});

describe('the per-image delivery decision', () => {
  it('refuses an anonymous viewer', () => {
    expect(
      mayReceiveImage(anonymous(), anUnrelatedRelationship(), ['anonymous']),
    ).toBe(false);
  });

  it('refuses an unrelated member', () => {
    expect(
      mayReceiveImage(aMember(), anUnrelatedRelationship(), ['unrelatedMember']),
    ).toBe(false);
  });

  it('refuses a claimant, even though their column grants the image field', () => {
    // **The load-bearing assertion.** The claimant's column grants the
    // `image` field — the reference is in their projection — and the bytes
    // are refused. An image is not ownership evidence.
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: REPORTER_ID,
      viewerId: VIEWER_ID,
      claimId: 'claim-1',
    });

    expect(
      mayReceiveImage(aMember(), relationship, ['unrelatedMember', 'claimant']),
    ).toBe(false);
  });

  it('refuses a recovery responder, even though their column grants the image field', () => {
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Lost',
      reporterId: REPORTER_ID,
      viewerId: VIEWER_ID,
      recoveryResponseId: 'response-1',
    });

    expect(
      mayReceiveImage(aMember(), relationship, ['unrelatedMember', 'recoveryResponder']),
    ).toBe(false);
  });

  it('delivers to the member who authored the report', () => {
    expect(
      mayReceiveImage(aMember(), theAuthorsRelationship(), ['unrelatedMember', 'foundReportOwner']),
    ).toBe(true);
  });

  it('delivers to the administrator', () => {
    // **The administrator's authority follows from the role**, not from a
    // relationship to the report.
    const administrator = aMember({ accountId: VIEWER_ID, isAdministrator: true });

    expect(
      mayReceiveImage(administrator, anUnrelatedRelationship(), ['administrator']),
    ).toBe(true);
  });

  it('refuses an owner column resolved for a report the viewer did not author', () => {
    // **The relationship is checked as well as the columns.** A column set
    // resolved for a different report must not authorise this one.
    expect(
      mayReceiveImage(aMember(), anUnrelatedRelationship(), ['foundReportOwner']),
    ).toBe(false);
  });

  it('refuses every column the matrix does not grant', () => {
    // **Every column, one at a time.** The refusal is the rule applied
    // uniformly, not a list of cases that happens to cover today's
    // categories.
    for (const column of ALL_COLUMNS) {
      if (column === 'foundReportOwner' || column === 'lostReportOwner' || column === 'administrator') {
        continue;
      }

      expect(
        mayReceiveImage(aMember(), anUnrelatedRelationship(), [column]),
      ).toBe(false);
    }
  });
});
