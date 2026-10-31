/**
 * The administrator's closure reason — 10–500 characters, **inclusive** at
 * both ends.
 *
 * **A close requires a reason, and the reason is not optional text.** PRD
 * FR-21 says the audit trail records "the administrator, the documented
 * reason, the prior report lifecycle status, and a timestamp", and the
 * story's edge case is explicit: "Close reason omitted | Refused; a reason
 * is required". A close with no reason would be an administrative action
 * with nothing to explain it — and the trail is the only place that
 * explanation would live.
 *
 * **The bound is the same bound as an administrator's Claim rejection
 * reason.** Both are administrator-supplied free text recorded on the
 * trail, and both are 10–500 characters. Sharing one bound is not a
 * coincidence of convenience: the two are the same kind of field, and a
 * bound that differed between them would be a bound that had been
 * re-implemented slightly differently.
 *
 * **The length is measured in code points, not UTF-16 code units,** so an
 * emoji counts as one character — which is what an administrator means by
 * "characters", and what the database's `char_length` counts.
 *
 * **The reason is stored verbatim.** It is not softened. The softening rule
 * of story 006 applies to the *auto-rejection's* visible copy, not to an
 * administrator's stated reason for closing a report.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import { buildBoundedText, type BoundedText } from './bounded-text';

/** The inclusive bounds on a closure reason. */
export const REPORT_CLOSURE_REASON_MIN_LENGTH = 10;
/** The inclusive bounds on a closure reason. */
export const REPORT_CLOSURE_REASON_MAX_LENGTH = 500;

/**
 * An administrator's closure reason.
 *
 * **Branded, so a closure reason and a Claim rejection reason are not
 * interchangeable.** Both are bounded text; only the brand tells them
 * apart.
 */
export type ReportClosureReason = BoundedText<'closure-reason'>;

/**
 * Build an administrator's closure reason.
 *
 * @throws {ValidationError} when the reason is shorter than 10 or longer
 * than 500 characters, or when it is not text at all.
 */
export function createReportClosureReason(value: string): ReportClosureReason {
  // **A reason that is not a string is refused, not coerced.** A `null`
  // would become the string "null" and pass a length check, and the trail
  // would record "null" as an administrator's reason.
  if (typeof value !== 'string') {
    throw new ValidationError(
      'reason',
      'Give a reason for closing this report, in 10 to 500 characters.',
    );
  }

  return buildBoundedText(
    'reason',
    value,
    REPORT_CLOSURE_REASON_MIN_LENGTH,
    REPORT_CLOSURE_REASON_MAX_LENGTH,
    'Give a reason for closing this report, in 10 to 500 characters.',
    'closure-reason',
  );
}
