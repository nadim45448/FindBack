/**
 * The Recovery Response value objects' and field validator's suite.
 *
 * **The bounds are FR-44's, and they are asserted at their edges.** A bound
 * that is only tested in the middle is a bound that may be off by one at
 * exactly the place a member would hit it.
 *
 * **The date-found bound is derived, not restated.** The 30-day bound comes
 * from the same `FOUND_DATE_MAX_AGE_DAYS` the Claim's date-lost rule uses,
 * and this suite asserts it is *that* number rather than a literal — so the
 * two sides cannot drift apart silently.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import { FOUND_DATE_MAX_AGE_DAYS } from '@/domain/listings';

import {
  createRecoveryResponseDraft,
  createRecoveryResponseObservedDetails,
  createRecoveryResponseWhereFound,
  validateRecoveryResponseDateFound,
  validateRecoveryResponseDraft,
  withCandidateImage,
  withResponder,
  type RecoveryResponseDraft,
} from '@/domain/recovery';

/** A fixed instant — the clock is injected, never ambient. */
const NOW = new Date('2026-10-30T12:00:00.000Z');

/** The deployment's active campus areas. */
const CAMPUS_AREAS = [
  { value: 'Main Library', label: 'Main Library', active: true },
  { value: 'Student Centre', label: 'Student Centre', active: true },
];

/** A draft that satisfies every bound. */
function aDraft(overrides: Partial<RecoveryResponseDraft> = {}): RecoveryResponseDraft {
  return createRecoveryResponseDraft({
    reportId: 'report-1',
    campusArea: 'Main Library',
    whereFoundExactPlace: 'On a bench outside the east entrance.',
    observedIdentifyingDetails: 'Brown leather, zip closure, scuffed corner.',
    dateFound: '2026-10-29',
    ...overrides,
  });
}

describe('the exact place value object', () => {
  it('accepts an empty text', () => {
    // **FR-44 marks the field optional** and gives it a lower bound of 0 —
    // so an empty string is a value the domain accepts, not a value it
    // rejects. A bound of 1 would forbid what the PRD permits.
    expect(createRecoveryResponseWhereFound('').value).toBe('');
  });

  it('accepts a text of exactly 200 characters', () => {
    expect(createRecoveryResponseWhereFound('a'.repeat(200)).value).toHaveLength(200);
  });

  it('refuses a text of 201 characters', () => {
    expect(() => createRecoveryResponseWhereFound('a'.repeat(201))).toThrow(ValidationError);
  });

  it('names the field in the refusal', () => {
    try {
      createRecoveryResponseWhereFound('a'.repeat(201));
      expect.unreachable('The value should have been refused.');
    } catch (error) {
      expect((error as ValidationError).field).toBe('whereFoundExactPlace');
    }
  });

  it('trims the text it keeps', () => {
    expect(createRecoveryResponseWhereFound('  a bench  ').value).toBe('a bench');
  });

  it('measures the trimmed text, not the raw one', () => {
    // A 200-character text surrounded by spaces is still a 200-character
    // text — the padding is not part of what the responder wrote.
    expect(() => createRecoveryResponseWhereFound(`  ${'a'.repeat(200)}  `)).not.toThrow();
  });
});

describe('the observed identifying details value object', () => {
  it('accepts a text of exactly 10 characters', () => {
    expect(createRecoveryResponseObservedDetails('a'.repeat(10)).value).toHaveLength(10);
  });

  it('refuses a text of 9 characters', () => {
    expect(() => createRecoveryResponseObservedDetails('a'.repeat(9))).toThrow(ValidationError);
  });

  it('accepts a text of exactly 500 characters', () => {
    expect(createRecoveryResponseObservedDetails('a'.repeat(500)).value).toHaveLength(500);
  });

  it('refuses a text of 501 characters', () => {
    expect(() => createRecoveryResponseObservedDetails('a'.repeat(501))).toThrow(ValidationError);
  });

  it('refuses an empty text', () => {
    expect(() => createRecoveryResponseObservedDetails('')).toThrow(ValidationError);
  });

  it('names the field in the refusal', () => {
    try {
      createRecoveryResponseObservedDetails('short');
      expect.unreachable('The value should have been refused.');
    } catch (error) {
      expect((error as ValidationError).field).toBe('observedIdentifyingDetails');
    }
  });
});

describe('the date found value object', () => {
  it('accepts today', () => {
    expect(validateRecoveryResponseDateFound('2026-10-30', NOW).isoDay).toBe('2026-10-30');
  });

  it('accepts a day exactly at the bound', () => {
    const day = new Date(NOW);
    day.setUTCDate(day.getUTCDate() - FOUND_DATE_MAX_AGE_DAYS);
    const iso = day.toISOString().slice(0, 10);

    expect(validateRecoveryResponseDateFound(iso, NOW).isoDay).toBe(iso);
  });

  it('refuses a day one past the bound', () => {
    const day = new Date(NOW);
    day.setUTCDate(day.getUTCDate() - FOUND_DATE_MAX_AGE_DAYS - 1);
    const iso = day.toISOString().slice(0, 10);

    expect(() => validateRecoveryResponseDateFound(iso, NOW)).toThrow(ValidationError);
  });

  it('refuses a date in the future', () => {
    expect(() => validateRecoveryResponseDateFound('2026-10-31', NOW)).toThrow(ValidationError);
  });

  it('names the field in the refusal', () => {
    try {
      validateRecoveryResponseDateFound('2026-10-31', NOW);
      expect.unreachable('The value should have been refused.');
    } catch (error) {
      expect((error as ValidationError).field).toBe('dateFound');
    }
  });

  it('derives its bound from the shared found-date rule', () => {
    // **The bound is not restated.** The Claim's date-lost rule and the
    // Response's date-found rule are the same product fact — "the day the
    // item was found" — so one number owns it and both sides read it.
    expect(FOUND_DATE_MAX_AGE_DAYS).toBe(30);
  });
});

describe('the recovery response field validator', () => {
  it('accepts a draft that satisfies every bound', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    expect(validated.status).toBe('Submitted');
    expect(validated.reportId).toBe('report-1');
    expect(validated.campusArea.value).toBe('Main Library');
  });

  it('refuses a campus area that is not one of the deployment\'s', () => {
    // **The set is injected** (ADR-20), so an area from another deployment
    // is refused rather than stored.
    expect(() =>
      validateRecoveryResponseDraft(aDraft({ campusArea: 'Elsewhere' }), {
        now: NOW,
        campusAreas: CAMPUS_AREAS,
      }),
    ).toThrow(ValidationError);
  });

  it('refuses observed details that are too short', () => {
    expect(() =>
      validateRecoveryResponseDraft(aDraft({ observedIdentifyingDetails: 'short' }), {
        now: NOW,
        campusAreas: CAMPUS_AREAS,
      }),
    ).toThrow(ValidationError);
  });

  it('refuses an exact place that is too long', () => {
    expect(() =>
      validateRecoveryResponseDraft(aDraft({ whereFoundExactPlace: 'a'.repeat(201) }), {
        now: NOW,
        campusAreas: CAMPUS_AREAS,
      }),
    ).toThrow(ValidationError);
  });

  it('refuses a date found in the future', () => {
    expect(() =>
      validateRecoveryResponseDraft(aDraft({ dateFound: '2026-10-31' }), {
        now: NOW,
        campusAreas: CAMPUS_AREAS,
      }),
    ).toThrow(ValidationError);
  });

  it('leaves the responder empty, because the responder is not a submitted field', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    expect(validated.responderId).toBe('');
  });

  it('leaves the candidate image absent, because the reference does not exist yet', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    expect(validated.candidateImageRef).toBeNull();
  });

  it('stamps the submitted, created, and updated times from the injected clock', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    expect(validated.submittedAt).toEqual(NOW);
    expect(validated.createdAt).toEqual(NOW);
    expect(validated.updatedAt).toEqual(NOW);
  });
});

describe('the responder and the candidate image attachments', () => {
  it('attaches the responder', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    expect(withResponder(validated, 'the-responder').responderId).toBe('the-responder');
  });

  it('attaches the candidate image reference', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    expect(withCandidateImage(validated, 'recovery-response-candidates/a.png').candidateImageRef).toBe(
      'recovery-response-candidates/a.png',
    );
  });

  it('leaves the image absent when there is none', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    expect(withCandidateImage(validated, null).candidateImageRef).toBeNull();
  });

  it('does not let an attachment change the validated fields', () => {
    const validated = validateRecoveryResponseDraft(aDraft(), {
      now: NOW,
      campusAreas: CAMPUS_AREAS,
    });

    const attached = withCandidateImage(withResponder(validated, 'the-responder'), 'a.png');

    expect(attached.dateFound.isoDay).toBe(validated.dateFound.isoDay);
    expect(attached.status).toBe('Submitted');
  });
});
