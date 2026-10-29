/**
 * The report field validator's suite.
 *
 * **The validator is the only path to a `Report`.** Every bound, every
 * closed set, and the date rule are asserted here, because this is the one
 * place they are enforced — and story 003's technical note says the same
 * validator serves creation and reporter edit, so a bound asserted here
 * holds on both paths.
 *
 * **The clock is injected.** "Exactly 365 days ago is accepted" and "tomorrow
 * is rejected" are ordinary assertions here, not tests that only pass on the
 * right day of the year.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  createReportDraft,
  validateReportDraft,
  type CampusArea,
  type ReportDraft,
  type ReportType,
} from '@/domain/listings';

/** The deployment's active areas. */
const AREAS: readonly CampusArea[] = [
  { value: 'library', label: 'Library', active: true },
  { value: 'student_centre', label: 'Student Centre', active: true },
];

/** A fixed instant, so every date assertion is deterministic. */
const NOW = new Date('2026-10-28T12:00:00.000Z');

/** The calendar day `NOW` falls on. */
const TODAY = '2026-10-28';

function aDraft(overrides: Partial<ReportDraft> = {}): ReportDraft {
  return createReportDraft({
    type: 'Lost',
    name: 'Brown leather wallet',
    category: 'Wallet',
    description: 'A brown leather wallet with a folded receipt inside.',
    date: TODAY,
    campusArea: 'library',
    ...overrides,
  });
}

function validate(draft: ReportDraft, type?: ReportType) {
  return validateReportDraft(
    type ? { ...draft, type } : draft,
    { now: NOW, campusAreas: AREAS },
  );
}

/** The field the validation error names. */
function fieldOf(fn: () => unknown): string {
  try {
    fn();
    expect.unreachable('The validator should have thrown.');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).field;
  }

  return '';
}

describe('the report field validator', () => {
  it('accepts a well-formed submission', () => {
    const validated = validate(aDraft());

    expect(validated.type).toBe('Lost');
    expect(validated.name.value).toBe('Brown leather wallet');
    expect(validated.category).toBe('Wallet');
    expect(validated.campusArea.value).toBe('library');
    expect(validated.status).toBe('Open');
    expect(validated.reporterId).toBe('');
    expect(validated.createdAt).toBe(NOW);
    expect(validated.updatedAt).toBe(NOW);
  });

  it('accepts an optional field that is present', () => {
    const validated = validate(
      aDraft({ exactPlace: 'Second floor, east stacks', identifyingDetails: 'Monogram A.B.' }),
    );

    expect(validated.exactPlace?.value).toBe('Second floor, east stacks');
    expect(validated.identifyingDetails?.value).toBe('Monogram A.B.');
  });

  it('treats an absent optional field as an explicit absence', () => {
    const validated = validate(aDraft());

    expect(validated.exactPlace).toBeNull();
    expect(validated.identifyingDetails).toBeNull();
  });

  // ── The closed sets ──────────────────────────────────────────────────────

  it('refuses a category that is not one of the nine', () => {
    expect(fieldOf(() => validate(aDraft({ category: 'Vehicle' })))).toBe('category');
  });

  it('refuses a campus area that is not in the active set', () => {
    expect(fieldOf(() => validate(aDraft({ campusArea: 'sports_centre' })))).toBe('campusArea');
  });

  it('accepts a campus area that is in the active set', () => {
    expect(validate(aDraft({ campusArea: 'student_centre' })).campusArea.value).toBe(
      'student_centre',
    );
  });

  it('refuses a campus area that is in the set but deactivated', () => {
    // The validator's contract is membership of the **active** set. The
    // reader returns only active areas, so a deactivated row cannot arrive
    // through the port — but the validator refuses it directly too, which
    // is the belt to the reader's braces.
    const deactivated: readonly CampusArea[] = [
      { value: 'library', label: 'Library', active: false },
    ];

    expect(
      fieldOf(() =>
        validateReportDraft(aDraft({ campusArea: 'library' }), {
          now: NOW,
          campusAreas: deactivated,
        }),
      ),
    ).toBe('campusArea');
  });

  // ── The bounds ───────────────────────────────────────────────────────────

  it('refuses a name that is too long', () => {
    expect(fieldOf(() => validate(aDraft({ name: 'x'.repeat(81) })))).toBe('name');
  });

  it('accepts a name of exactly 80 characters', () => {
    expect(validate(aDraft({ name: 'x'.repeat(80) })).name.value).toHaveLength(80);
  });

  it('refuses a whitespace-only name', () => {
    expect(fieldOf(() => validate(aDraft({ name: '   ' })))).toBe('name');
  });

  it('refuses a description that is too short', () => {
    expect(fieldOf(() => validate(aDraft({ description: 'short' })))).toBe('description');
  });

  it('accepts a description of exactly 10 characters', () => {
    expect(validate(aDraft({ description: 'x'.repeat(10) })).description.value).toHaveLength(10);
  });

  it('refuses a description that is too long', () => {
    expect(fieldOf(() => validate(aDraft({ description: 'x'.repeat(2001) })))).toBe('description');
  });

  it('refuses an exact place that is too long', () => {
    expect(fieldOf(() => validate(aDraft({ exactPlace: 'x'.repeat(201) })))).toBe('exactPlace');
  });

  it('refuses identifying details that are too long', () => {
    expect(
      fieldOf(() => validate(aDraft({ identifyingDetails: 'x'.repeat(501) }))),
    ).toBe('identifyingDetails');
  });

  // ── The date rule ────────────────────────────────────────────────────────

  it('refuses a date in the future', () => {
    expect(fieldOf(() => validate(aDraft({ date: '2026-10-29' })))).toBe('date');
  });

  it('accepts today', () => {
    expect(validate(aDraft({ date: TODAY })).date.isoDay).toBe(TODAY);
  });

  it('accepts a Lost date exactly 365 days ago', () => {
    // The past bound is **inclusive**: "date lost exactly 365 days ago |
    // Accepted".
    expect(validate(aDraft({ date: '2025-10-28' })).date.isoDay).toBe('2025-10-28');
  });

  it('refuses a Lost date 366 days ago', () => {
    expect(fieldOf(() => validate(aDraft({ date: '2025-10-27' })))).toBe('date');
  });

  it('accepts a Found date exactly 30 days ago', () => {
    expect(
      validate(aDraft({ date: '2026-09-28' }), 'Found').date.isoDay,
    ).toBe('2026-09-28');
  });

  it('refuses a Found date 31 days ago', () => {
    expect(fieldOf(() => validate(aDraft({ date: '2026-09-27' }), 'Found'))).toBe('date');
  });

  it('applies the Lost bound to a Lost report and the Found bound to a Found report', () => {
    // The same date is acceptable for one type and not the other. That is
    // the whole point of reading the bound from the type.
    const date = '2026-09-01';

    expect(() => validate(aDraft({ date }), 'Found')).toThrow(ValidationError);
    expect(() => validate(aDraft({ date }), 'Lost')).not.toThrow();
  });

  it('compares by calendar day, ignoring a time component', () => {
    // A date entered with a time is **accepted and truncated** to its
    // calendar day — the PRD's rule is that the date is compared by
    // calendar day, so rejecting a valid date because it carries a time
    // would be stricter than the requirement.
    const validated = validate(aDraft({ date: '2026-10-28T23:59:59.000Z' }));

    expect(validated.date.isoDay).toBe('2026-10-28');
  });

  it('refuses a date that is not a date at all', () => {
    expect(fieldOf(() => validate(aDraft({ date: 'not-a-date' })))).toBe('date');
  });

  it('refuses an empty date', () => {
    expect(fieldOf(() => validate(aDraft({ date: '' })))).toBe('date');
  });

  // ── The error carries the field name, never the value ───────────────────

  it('does not carry the submitted value in the error', () => {
    const secret = 'a very distinctive identifying detail that must not leak';

    try {
      validate(aDraft({ identifyingDetails: `${secret}${'x'.repeat(500)}` }));
      expect.unreachable('The validator should have thrown.');
    } catch (error) {
      expect((error as ValidationError).field).toBe('identifyingDetails');
      expect((error as ValidationError).message).not.toContain(secret);
    }
  });
});
