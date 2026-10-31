/**
 * The claim review service's suite.
 *
 * **The review screen is a read-only assembly,** so the assertions are
 * about what the screen carries and what it does *not* carry — there is no
 * transaction to assert on, no write to assert on, and no audit event to
 * assert on. The absence of those is the point: story 002 says the screen
 * "performs no state transition".
 */

import { describe, expect, it } from 'vitest';

import { ClaimReviewService } from '@/application/listings/claim-review-service';
import type {
  ClaimReviewFacts,
  ClaimReviewReader,
} from '@/application/listings/ports/claim-review-reader';

import type { ClaimStatus } from '@/domain/listings';

/** The facts the reader returns by default. */
const FACTS: ClaimReviewFacts = {
  claim: {
    claimId: 'claim-1',
    status: 'Pending',
    reportId: 'report-1',
    reason: 'It is my brown leather wallet.',
    identifyingDetails: 'Blue cardholder with a dent.',
    dateLost: '2026-10-20',
    submittedAt: new Date('2026-10-29T10:00:00.000Z'),
  },
  item: {
    name: 'A brown leather wallet',
    category: 'Wallet',
    date: '2026-10-28',
    campusArea: 'library',
  },
  competingClaims: [],
};

/** A recording fake of the review reader. */
class Harness {
  /** The facts the reader returns. `null` means "no such claim". */
  facts: ClaimReviewFacts | null = FACTS;

  /** How many times the reader was called. */
  reads = 0;

  readonly reader: ClaimReviewReader = {
    readReviewFacts: async (): Promise<ClaimReviewFacts | null> => {
      this.reads += 1;

      return this.facts;
    },
  };

  readonly service: ClaimReviewService = new ClaimReviewService(this.reader);
}

describe('the claim review service', () => {
  it('assembles the screen from the reader’s facts', async () => {
    const harness = new Harness();

    const screen = await harness.service.review({ claimId: 'claim-1' });

    expect(screen.claimId).toBe('claim-1');
    expect(screen.claimStatus).toBe('Pending');
    expect(screen.reason).toBe('It is my brown leather wallet.');
    expect(screen.identifyingDetails).toBe('Blue cardholder with a dent.');
    expect(screen.dateLost).toBe('2026-10-20');
    expect(screen.item.name).toBe('A brown leather wallet');
  });

  it('carries the claim’s evidence to the administrator', async () => {
    // **The reason and the identifying details are FR-37 Sensitive
    // Fields,** and the review screen is the one place the finder is *not*
    // a viewer of them. The route refuses a non-administrator before this
    // assembly is ever built.
    const harness = new Harness();

    const screen = await harness.service.review({ claimId: 'claim-1' });

    expect(screen.reason.length).toBeGreaterThan(0);
    expect(screen.identifyingDetails.length).toBeGreaterThan(0);
  });

  it('derives the competing-claim count from the list', async () => {
    // **The count and the list cannot disagree** — the count is derived,
    // never counted separately.
    const harness = new Harness();
    harness.facts = {
      ...FACTS,
      competingClaims: [
        { claimId: 'claim-2', submittedAt: new Date('2026-10-29T09:00:00.000Z') },
        { claimId: 'claim-3', submittedAt: new Date('2026-10-29T08:00:00.000Z') },
      ],
    };


    const screen = await harness.service.review({ claimId: 'claim-1' });

    expect(screen.competingClaimCount).toBe(2);
    expect(screen.competingClaims).toHaveLength(2);
  });

  it('offers the decision action while the claim is pending', async () => {
    const harness = new Harness();

    const screen = await harness.service.review({ claimId: 'claim-1' });

    expect(harness.service.offersDecision(screen)).toBe(true);
  });

  it('withdraws the decision action once the claim is decided', async () => {
    // **A decided Claim still assembles** — an administrator following a
    // stale link must see *what happened*, not a 404 — but the actions are
    // gone.
    const harness = new Harness();
    harness.facts = { ...FACTS, claim: { ...FACTS.claim, status: 'Approved' } };

    const screen = await harness.service.review({ claimId: 'claim-1' });

    expect(screen.claimStatus).toBe('Approved');
    expect(harness.service.offersDecision(screen)).toBe(false);
  });

  it('withdraws the decision action for every terminal status', async () => {
    const statuses: ClaimStatus[] = ['Approved', 'Rejected', 'Returned'];

    for (const status of statuses) {
      const harness = new Harness();
      harness.facts = { ...FACTS, claim: { ...FACTS.claim, status } };

      const screen = await harness.service.review({ claimId: 'claim-1' });

      expect(harness.service.offersDecision(screen)).toBe(false);
    }
  });

  it('shows the empty string for a claim that carries no evidence', async () => {
    // **A lifecycle-written Claim's reason and details are genuinely
    // absent,** and the screen shows the absence rather than pretending
    // there was something there.
    const harness = new Harness();
    harness.facts = {
      ...FACTS,
      claim: { ...FACTS.claim, reason: '', identifyingDetails: '' },
    };

    const screen = await harness.service.review({ claimId: 'claim-1' });

    expect(screen.reason).toBe('');
    expect(screen.identifyingDetails).toBe('');
  });

  it('refuses a claim that does not exist', async () => {
    const harness = new Harness();
    harness.facts = null;

    await expect(harness.service.review({ claimId: 'missing' })).rejects.toThrow(
      'No claim with that id.',
    );
  });

  it('reads the claim exactly once', async () => {
    // **A read-only assembly opens no transaction and reads once.**
    const harness = new Harness();

    await harness.service.review({ claimId: 'claim-1' });

    expect(harness.reads).toBe(1);
  });
});
