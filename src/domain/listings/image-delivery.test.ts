/**
 * The per-image delivery rule — who may receive the image's **bytes**.
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
  it('names the columns that can grant bytes', () => {
    expect(IMAGE_DELIVERY_COLUMNS).toEqual([
      'unrelatedMember',
      'foundReportOwner',
      'lostReportOwner',
      'administrator',
    ]);
  });

  it('grants the bytes to a claimant browsing the Found report', () => {
    expect(grantsImageDelivery(['unrelatedMember', 'claimant'])).toBe(true);
  });

  it('grants the bytes to a recovery responder browsing the Lost report', () => {
    expect(grantsImageDelivery(['unrelatedMember', 'recoveryResponder'])).toBe(true);
  });

  it('grants the bytes to an unrelated member browsing a report', () => {
    expect(grantsImageDelivery(['unrelatedMember'])).toBe(true);
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

  it('delivers to an unrelated member browsing a report', () => {
    expect(
      mayReceiveImage(aMember(), anUnrelatedRelationship(), ['unrelatedMember']),
    ).toBe(true);
  });

  it('delivers to a claimant on the Found report', () => {
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: REPORTER_ID,
      viewerId: VIEWER_ID,
      claimId: 'claim-1',
    });

    expect(
      mayReceiveImage(aMember(), relationship, ['unrelatedMember', 'claimant']),
    ).toBe(true);
  });

  it('delivers to a recovery responder on the Lost report', () => {
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Lost',
      reporterId: REPORTER_ID,
      viewerId: VIEWER_ID,
      recoveryResponseId: 'response-1',
    });

    expect(
      mayReceiveImage(aMember(), relationship, ['unrelatedMember', 'recoveryResponder']),
    ).toBe(true);
  });

  it('delivers to the member who authored the report', () => {
    expect(
      mayReceiveImage(aMember(), theAuthorsRelationship(), ['unrelatedMember', 'foundReportOwner']),
    ).toBe(true);
  });

  it('delivers to the administrator', () => {
    const administrator = aMember({ accountId: VIEWER_ID, isAdministrator: true });

    expect(
      mayReceiveImage(administrator, anUnrelatedRelationship(), ['administrator']),
    ).toBe(true);
  });

  it('refuses an owner column resolved for a report the viewer did not author', () => {
    expect(
      mayReceiveImage(aMember(), anUnrelatedRelationship(), ['foundReportOwner']),
    ).toBe(false);
  });

  it('refuses every column that does not grant bytes', () => {
    for (const column of ALL_COLUMNS) {
      if (
        column === 'unrelatedMember' ||
        column === 'foundReportOwner' ||
        column === 'lostReportOwner' ||
        column === 'administrator'
      ) {
        continue;
      }

      expect(
        mayReceiveImage(aMember(), anUnrelatedRelationship(), [column]),
      ).toBe(false);
    }
  });
});
