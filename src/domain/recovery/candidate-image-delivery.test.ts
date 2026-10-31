/**
 * The candidate image delivery rule's suite.
 *
 * **The competing responder is the case this rule exists for.** Two
 * responders submit independently on the same Lost report, and each is a
 * candidate for the same item. The responder's own image is theirs; the
 * *other* responder's image is not, and the two are separated by a single
 * boolean — `isResponder` — computed from the row rather than from the
 * URL.
 *
 * **The refusals are indistinguishable.** An anonymous visitor, an unrelated
 * member, a competing responder, and a claimant all receive the same answer,
 * so none of them learns anything about the others.
 */

import { describe, expect, it } from 'vitest';

import { anonymousViewer } from '@/domain/listings/viewer';
import type { Viewer } from '@/domain/listings/viewer';

import {
  CANDIDATE_IMAGE_DELIVERY_COLUMNS,
  mayReceiveCandidateImage,
  type CandidateImageRelationship,
} from './candidate-image-delivery';

const RESPONDER_ID = '00000000-0000-4000-8000-000000000911';
const OTHER_RESPONDER_ID = '00000000-0000-4000-8000-000000000912';
const REPORT_OWNER_ID = '00000000-0000-4000-8000-000000000913';
const UNRELATED_ID = '00000000-0000-4000-8000-000000000914';

/** A member viewer. */
function aMember(accountId: string, isAdministrator = false): Viewer {
  return {
    kind: 'member',
    accountId,
    isAdministrator,
    displayName: 'A Member',
  };
}

/**
 * A relationship.
 *
 * **The defaults are the "competing responder" case** — the viewer is a
 * member of the report, is not the responder, and is not the owner — so a
 * test that overrides only what it cares about exercises the refusal.
 */
function aRelationship(overrides: Partial<CandidateImageRelationship> = {}): CandidateImageRelationship {
  return {
    responseId: 'response-1',
    reportId: 'report-1',
    responderId: RESPONDER_ID,
    reportOwnerId: REPORT_OWNER_ID,
    viewerId: OTHER_RESPONDER_ID,
    isResponder: false,
    ...overrides,
  };
}

describe('the candidate image delivery rule', () => {
  describe('the refusals', () => {
    it('refuses an anonymous viewer', () => {
      expect(
        mayReceiveCandidateImage(
          anonymousViewer(),
          aRelationship({ viewerId: null }),
          ['anonymous'],
        ),
      ).toBe(false);
    });

    it('refuses an unrelated member', () => {
      expect(
        mayReceiveCandidateImage(
          aMember(UNRELATED_ID),
          aRelationship({ viewerId: UNRELATED_ID }),
          ['unrelatedMember'],
        ),
      ).toBe(false);
    });

    it('refuses a competing responder', () => {
      // **The load-bearing refusal.** The other responder holds the same
      // FR-39 column — `recoveryResponder` — and is still refused, because
      // the column says nothing about *which* response.
      expect(
        mayReceiveCandidateImage(
          aMember(OTHER_RESPONDER_ID),
          aRelationship(),
          ['unrelatedMember', 'recoveryResponder'],
        ),
      ).toBe(false);
    });

    it('refuses a competing responder even when they hold the responder column', () => {
      expect(
        mayReceiveCandidateImage(
          aMember(OTHER_RESPONDER_ID),
          aRelationship({ isResponder: false }),
          ['recoveryResponder'],
        ),
      ).toBe(false);
    });

    it('refuses a claimant on the Lost report', () => {
      // **Participation is never permission.** A Claim is on the Found side;
      // a claimant on a Lost report is an unrelated member here.
      expect(
        mayReceiveCandidateImage(
          aMember(UNRELATED_ID),
          aRelationship({ viewerId: UNRELATED_ID }),
          ['unrelatedMember', 'claimant'],
        ),
      ).toBe(false);
    });

    it('refuses the owner column when the viewer did not author the report', () => {
      // **The owner column requires authorship.** A column set resolved for
      // a different report must not authorise this one.
      expect(
        mayReceiveCandidateImage(
          aMember(OTHER_RESPONDER_ID),
          aRelationship({ viewerId: OTHER_RESPONDER_ID }),
          ['lostReportOwner'],
        ),
      ).toBe(false);
    });
  });

  describe('the grants', () => {
    it('grants the responder their own image', () => {
      expect(
        mayReceiveCandidateImage(
          aMember(RESPONDER_ID),
          aRelationship({ viewerId: RESPONDER_ID, isResponder: true }),
          ['unrelatedMember', 'recoveryResponder'],
        ),
      ).toBe(true);
    });

    it('grants the Lost-report owner', () => {
      expect(
        mayReceiveCandidateImage(
          aMember(REPORT_OWNER_ID),
          aRelationship({ viewerId: REPORT_OWNER_ID }),
          ['lostReportOwner'],
        ),
      ).toBe(true);
    });

    it('grants the administrator', () => {
      expect(
        mayReceiveCandidateImage(
          aMember(UNRELATED_ID, true),
          aRelationship({ viewerId: UNRELATED_ID }),
          ['administrator'],
        ),
      ).toBe(true);
    });
  });

  describe('the column set', () => {
    it('grants the Lost-report owner and the administrator', () => {
      expect([...CANDIDATE_IMAGE_DELIVERY_COLUMNS]).toEqual([
        'lostReportOwner',
        'administrator',
      ]);
    });

    it('does not grant the recovery responder column', () => {
      // **The responder's grant is a relationship, not a column.** A
      // competing responder holds this column, so granting it would grant
      // them every candidate image on the report.
      expect(CANDIDATE_IMAGE_DELIVERY_COLUMNS).not.toContain('recoveryResponder');
    });

    it('does not grant the claimant column', () => {
      expect(CANDIDATE_IMAGE_DELIVERY_COLUMNS).not.toContain('claimant');
    });
  });
});
