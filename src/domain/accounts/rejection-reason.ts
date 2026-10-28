/**
 * The `RejectionReason` value object.
 *
 * The reason is stored verbatim for the audit trail, even where user-facing
 * copy would be softened (story 007's technical note). It is **never**
 * returned to the member, in any form, for any status.
 *
 * **The two-layer rule.** FR-3 says a rejection "requires a short reason
 * (free text, minimum 5 characters)". Story 002's edge case says "Rejection
 * reason left blank → Rejected without a reason string". Both hold, because
 * they are rules at different layers:
 *
 * - The **route boundary** enforces the minimum. A reason of fewer than 5
 *   characters is a validation error and the decision does not commit.
 * - The **aggregate** does not require a reason to exist. `reject()` accepts
 *   a missing reason, because a decision must always be recordable — an
 *   administrator must never be unable to reject an account because the
 *   reason box was empty.
 *
 * So the PRD's minimum is enforced on **input**, and the domain tolerates
 * its absence.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** The shortest rejection reason the boundary accepts. */
export const MIN_REJECTION_REASON_LENGTH = 5;

/** The longest rejection reason accepted. */
export const MAX_REJECTION_REASON_LENGTH = 500;

/** The rejection reason. */
export interface RejectionReason {
  readonly value: string;
}

/**
 * Build a rejection reason.
 *
 * @throws {ValidationError} when the reason is present but shorter than the
 * PRD's minimum, or longer than the maximum. A **missing** reason is not an
 * error here — the aggregate tolerates it (see the two-layer rule above).
 */
export function createRejectionReason(raw: string | null | undefined): RejectionReason | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const value = raw.trim();

  if (value.length === 0) {
    return null;
  }

  if (value.length < MIN_REJECTION_REASON_LENGTH) {
    throw new ValidationError(
      'reason',
      `The reason must be at least ${MIN_REJECTION_REASON_LENGTH} characters.`,
    );
  }

  if (value.length > MAX_REJECTION_REASON_LENGTH) {
    throw new ValidationError(
      'reason',
      `The reason must be at most ${MAX_REJECTION_REASON_LENGTH} characters.`,
    );
  }

  return { value };
}
