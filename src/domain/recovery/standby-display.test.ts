/**
 * The `Standby` display derivation's suite.
 *
 * **The load-bearing assertion is that the stored status never changes.**
 *
 * A standby response is `Submitted` in the database and
 * `Submitted — Standby` on screen. **Those are two different facts about two
 * different things**, and a derivation that returned the standby label as if
 * it were a status would let the display value leak into a write — and
 * `Standby` is not a status the database accepts.
 */

import { describe, expect, it } from 'vitest';

import {
  deriveDisplayStatus,
  isStandby,
  siblingStatuses,
  STANDBY_DISPLAY_STATUS,
  storedStatusOf,
  type SiblingResponse,
} from './standby-display';

/** The three responses on a report where one is selected. */
const WITH_SELECTION: readonly SiblingResponse[] = [
  { id: 'response-1', status: 'Submitted' },
  { id: 'response-2', status: 'Selected for Verification' },
  { id: 'response-3', status: 'Submitted' },
];

describe('the standby label', () => {
  it('is the PRD string, em dash included', () => {
    // **Never assembled from parts.** A response that renders
    // `Submitted - Standby` with a hyphen is not the string the PRD names.
    expect(STANDBY_DISPLAY_STATUS).toBe('Submitted — Standby');
  });

  it('is not a canonical status', () => {
    // **The label is not a status.** It cannot be stored, and it is not in
    // the vocabulary.
    expect(storedStatusOf(STANDBY_DISPLAY_STATUS)).toBeNull();
  });
});

describe('deriving the display status', () => {
  it('renders a sibling of the selection as Submitted — Standby', () => {
    expect(deriveDisplayStatus('response-1', 'Submitted', WITH_SELECTION)).toBe(
      STANDBY_DISPLAY_STATUS,
    );
  });

  it('renders the selected response with its own status', () => {
    // **The selected response is not standing by** — it is the one doing
    // the waiting.
    expect(
      deriveDisplayStatus('response-2', 'Selected for Verification', WITH_SELECTION),
    ).toBe('Selected for Verification');
  });

  it('renders a lone response as plain Submitted', () => {
    const alone: readonly SiblingResponse[] = [{ id: 'response-1', status: 'Submitted' }];

    expect(deriveDisplayStatus('response-1', 'Submitted', alone)).toBe('Submitted');
  });

  it('stops rendering standby once the selection becomes Not a Match', () => {
    // **The story's edge case.** The sibling is no longer standby; it
    // displays plain `Submitted`.
    const afterNotAMatch: readonly SiblingResponse[] = [
      { id: 'response-1', status: 'Submitted' },
      { id: 'response-2', status: 'Not a Match' },
      { id: 'response-3', status: 'Submitted' },
    ];

    expect(deriveDisplayStatus('response-1', 'Submitted', afterNotAMatch)).toBe(
      'Submitted',
    );
  });

  it('moves the standby label when the selection moves', () => {
    // **The derivation reads the current statuses every time.** The new
    // selection's siblings are standby and the old selection's are not —
    // with nothing stored to remember either.
    const afterMoving: readonly SiblingResponse[] = [
      { id: 'response-1', status: 'Selected for Verification' },
      { id: 'response-2', status: 'Submitted' },
      { id: 'response-3', status: 'Submitted' },
    ];

    expect(deriveDisplayStatus('response-2', 'Submitted', afterMoving)).toBe(
      STANDBY_DISPLAY_STATUS,
    );
    expect(
      deriveDisplayStatus('response-1', 'Selected for Verification', afterMoving),
    ).toBe('Selected for Verification');
  });

  it('never renders a non-Submitted response as standby', () => {
    for (const status of [
      'Selected for Verification',
      'Match Confirmed',
      'Not a Match',
      'Completed — Report Returned',
      'Resolved — Report Returned',
      'Resolved — Report Closed',
      'Withdrawn',
    ] as const) {
      expect(deriveDisplayStatus('response-1', status, WITH_SELECTION)).toBe(status);
    }
  });

  it('does not treat a response as its own sibling', () => {
    // **The comparison is by identity.** A response cannot be its own
    // sibling, and the selected response is never standby because of
    // itself.
    const onlyItself: readonly SiblingResponse[] = [
      { id: 'response-1', status: 'Selected for Verification' },
    ];

    expect(deriveDisplayStatus('response-1', 'Submitted', onlyItself)).toBe('Submitted');
  });
});

describe('asking whether a response is standby', () => {
  it('answers the same question as the derivation', () => {
    expect(isStandby('response-1', 'Submitted', WITH_SELECTION)).toBe(true);
    expect(
      isStandby('response-2', 'Selected for Verification', WITH_SELECTION),
    ).toBe(false);
  });

  it('is true for every sibling of the selection', () => {
    for (const sibling of ['response-1', 'response-3']) {
      expect(isStandby(sibling, 'Submitted', WITH_SELECTION)).toBe(true);
    }
  });

  it('agrees with the derivation on every sibling', () => {
    // **One rule, two forms.** The predicate and the derivation must never
    // disagree about the same response.
    for (const sibling of WITH_SELECTION) {
      const derived = deriveDisplayStatus(sibling.id, sibling.status, WITH_SELECTION);

      expect(derived === STANDBY_DISPLAY_STATUS).toBe(
        isStandby(sibling.id, sibling.status, WITH_SELECTION),
      );
    }
  });
});

describe('the sibling statuses', () => {
  it('lists every response status on the report', () => {
    expect(siblingStatuses(WITH_SELECTION)).toEqual([
      'Submitted',
      'Selected for Verification',
      'Submitted',
    ]);
  });

  it('is empty for a report with no responses', () => {
    expect(siblingStatuses([])).toEqual([]);
  });
});

describe('reading a stored status', () => {
  it('accepts each canonical status', () => {
    expect(storedStatusOf('Submitted')).toBe('Submitted');
    expect(storedStatusOf('Match Confirmed')).toBe('Match Confirmed');
  });

  it('refuses Standby', () => {
    // **A value the database could not have written.** The CHECK constraint
    // rejects the write, so this only guards the read.
    expect(storedStatusOf('Standby')).toBeNull();
  });

  it('refuses an unknown value rather than coercing it', () => {
    expect(storedStatusOf('Completed')).toBeNull();
    expect(storedStatusOf('')).toBeNull();
  });
});
