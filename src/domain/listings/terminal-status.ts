/**
 * The report's **terminal** status — the two statuses a report can never
 * leave.
 *
 * **Why this is a type and not a boolean.**
 *
 * FR-9 blocks edits at `Returned` **and** at `Closed`, and the PRD names a
 * **different message** for each:
 *
 * - "Returned reports cannot be edited."
 * - "Closed reports cannot be edited."
 *
 * A boolean `isTerminal(status)` plus a message assembled by substitution
 * would produce both messages correctly *by luck*, and it would keep
 * working only as long as nobody reordered the status list or added a third
 * terminal status. Narrowing the type makes the two distinct messages a
 * **requirement of the type**: a function that must produce a message for a
 * `TerminalStatus` cannot be handed a non-terminal one, and a
 * `TerminalStatus` carries everything needed to pick the right message.
 *
 * **The messages are frozen UX.** The PRD names them verbatim, and
 * `coding-standards.md` § Error handling forbids editing user-facing wording
 * while writing code. They are therefore literals here, not templates.
 *
 * Pure — no I/O, no framework imports.
 */

import { TERMINAL_REPORT_STATUSES, type ReportStatus } from './report-status';

/**
 * The statuses a report can never leave.
 *
 * `Returned` and `Closed` — the two the PRD names as terminal.
 */
export type TerminalStatus = 'Returned' | 'Closed';

/**
 * Narrow a status to its terminal form.
 *
 * @returns the terminal status, or `null` when the status is not terminal.
 */
export function asTerminalStatus(status: ReportStatus): TerminalStatus | null {
  return TERMINAL_REPORT_STATUSES.includes(status) ? (status as TerminalStatus) : null;
}

/**
 * The message that explains why a terminal report cannot be edited.
 *
 * **One message per status, and the two are never shared.** The PRD states
 * them separately, and a member who sees "Closed reports cannot be edited."
 * on a `Returned` report has been told something false.
 */
export function terminalEditMessage(status: TerminalStatus): string {
  switch (status) {
    case 'Returned':
      return 'Returned reports cannot be edited.';
    case 'Closed':
      return 'Closed reports cannot be edited.';
    default: {
      // The switch is exhaustive over `TerminalStatus`, so the compiler is
      // the check that no branch is missing — the same discipline
      // `coding-standards.md` requires for `ReportStatus`.
      const unreachable: never = status;
      throw new Error(`Unhandled terminal status: ${String(unreachable)}`);
    }
  }
}
