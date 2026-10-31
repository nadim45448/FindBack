/**
 * The content removal's suite.
 *
 * **A removal hides content from members; it does not delete it, and it does
 * not close the report.** Two properties carry this module:
 *
 * 1. **A repeated removal is idempotent.** The story's edge case is explicit:
 *    *"A repeated removal on the same target is idempotent — no duplicate
 *    audit entry."* The second call still succeeds — the content stays
 *    withheld — but it records nothing new.
 * 2. **The target kind is closed.** A removal naming a kind the system does
 *    not hold would record a moderation action against nothing.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  CONTENT_REMOVAL_TARGET_KINDS,
  decideContentRemoval,
  isContentRemovalTargetKind,
  type ContentRemovalFacts,
} from './content-removal';

// ── The facts ───────────────────────────────────────────────────────────────

/** The administrator's reason. */
const REASON = 'The photograph shows another person and must be taken down.';

/** The facts the decision reads. */
function facts(overrides: Partial<ContentRemovalFacts> = {}): ContentRemovalFacts {
  return {
    reportId: 'report-1',
    actingAdministratorId: 'admin-1',
    target: { kind: 'report_image', targetId: 'image-1' },
    reason: REASON,
    alreadyRemoved: false,
    ...overrides,
  };
}

// ── The target kinds ────────────────────────────────────────────────────────

describe('the content removal — the target kinds', () => {
  it('names exactly the three kinds the system holds', () => {
    // **The kinds are closed.** Each names a column or a row the database
    // actually holds — an open-ended "remove this thing" would let a caller
    // name a target the system does not hold.
    expect(CONTENT_REMOVAL_TARGET_KINDS).toEqual([
      'report_image',
      'report_description',
      'thread_message',
    ]);
  });

  it('accepts each of the three kinds', () => {
    for (const kind of CONTENT_REMOVAL_TARGET_KINDS) {
      expect(isContentRemovalTargetKind(kind)).toBe(true);
    }
  });

  it('refuses a kind the system does not hold', () => {
    expect(isContentRemovalTargetKind('report')).toBe(false);
    expect(isContentRemovalTargetKind('claim')).toBe(false);
    expect(isContentRemovalTargetKind('')).toBe(false);
  });

  it('refuses a removal naming a kind the system does not hold', () => {
    const decision = decideContentRemoval(
      facts({
        target: { kind: 'report' as 'report_image', targetId: 'image-1' },
      }),
    );

    expect(decision.kind).toBe('Refused');
    expect(decision.kind === 'Refused' && decision.reason).toBe('UnknownTargetKind');
  });
});

// ── The reason ──────────────────────────────────────────────────────────────

describe('the content removal — the reason', () => {
  it('refuses a removal with no reason', () => {
    // **A removal without a reason is refused.** The reason is the only
    // record of why an administrator withheld a member's content.
    expect(() => decideContentRemoval(facts({ reason: '' }))).toThrow(ValidationError);
  });

  it('refuses a reason shorter than ten characters', () => {
    expect(() => decideContentRemoval(facts({ reason: 'Too short' }))).toThrow(
      ValidationError,
    );
  });

  it('refuses a reason longer than five hundred characters', () => {
    expect(() => decideContentRemoval(facts({ reason: 'x'.repeat(501) }))).toThrow(
      ValidationError,
    );
  });

  it('refuses a whitespace-only reason', () => {
    expect(() => decideContentRemoval(facts({ reason: '          ' }))).toThrow(
      ValidationError,
    );
  });

  it('keeps a reason containing markup verbatim', () => {
    // **The reason is stored verbatim, and it is never rendered as HTML.**
    // The story's edge case is explicit, and storing it verbatim is this
    // module's half of the guarantee; the rendering layer owns the other.
    const marked = '<script>alert("x")</script> The image is inappropriate.';

    const decision = decideContentRemoval(facts({ reason: marked }));

    expect(decision.kind === 'Permitted' && decision.reason.value).toBe(marked);
  });
});

// ── The idempotence ─────────────────────────────────────────────────────────

describe('the content removal — the idempotence', () => {
  it('records a new removal when the target is not yet withheld', () => {
    const decision = decideContentRemoval(facts({ alreadyRemoved: false }));

    expect(decision.kind === 'Permitted' && decision.recordsNewRemoval).toBe(true);
  });

  it('records nothing when the target is already withheld', () => {
    // **A second removal of content that is already withheld is not a second
    // moderation act** — it is the same act, asked twice.
    const decision = decideContentRemoval(facts({ alreadyRemoved: true }));

    expect(decision.kind === 'Permitted' && decision.recordsNewRemoval).toBe(false);
  });

  it('permits a repeated removal rather than refusing it', () => {
    // **The removal still succeeds.** The content is withheld, which is what
    // the caller asked for; only the *record* is suppressed.
    const decision = decideContentRemoval(facts({ alreadyRemoved: true }));

    expect(decision.kind).toBe('Permitted');
  });
});

// ── What the decision carries ───────────────────────────────────────────────

describe('the content removal — what it carries', () => {
  it('carries the report, the administrator, and the target', () => {
    const decision = decideContentRemoval(facts());

    expect(decision.kind === 'Permitted' && decision.reportId).toBe('report-1');
    expect(decision.kind === 'Permitted' && decision.actingAdministratorId).toBe('admin-1');
    expect(decision.kind === 'Permitted' && decision.target).toEqual({
      kind: 'report_image',
      targetId: 'image-1',
    });
  });

  it('carries the reason as a value object, not a raw string', () => {
    // **The bound lives in one place.** The decision returns the domain's
    // value object, so a caller cannot read an unbounded string out of it.
    const decision = decideContentRemoval(facts());

    expect(decision.kind === 'Permitted' && decision.reason.value).toBe(REASON);
  });

  it('does not carry a status change', () => {
    // **A removal is not a lifecycle transition.** The decision says nothing
    // about the report's status, and FR-36 says the report's status is
    // unchanged unless closure was separately requested.
    const decision = decideContentRemoval(facts());

    expect(decision).not.toHaveProperty('status');
    expect(decision).not.toHaveProperty('reportStatus');
  });
});
