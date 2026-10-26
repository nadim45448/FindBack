/**
 * The stdout operational logger.
 *
 * stdout is the log sink on Vercel, so a console call is intended here.
 *
 * The log line's shape is fixed by `RequestContext` — a closed type with no
 * field capable of carrying a sensitive value. The type is the control: a
 * developer cannot log a Claim reason because there is nowhere to put one.
 *
 * **No vendor SDK.** The $0 ceiling is a budget constraint expressed as
 * architecture, not a preference (ADR-4).
 */

import type { OperationalLogger } from '@/application/ports/operational-logger';
import type { RequestContext } from '@/domain/audit';

/** Writes structured JSON log lines to stdout. */
export class StdoutOperationalLogger implements OperationalLogger {
  /**
   * Write one log line.
   *
   * A logging failure never blocks the action it describes — PRD §10 requires
   * that a failed background action is recorded, not that a failed log line
   * breaks a user's request.
   */
  log(context: RequestContext): void {
    try {
      console.log(JSON.stringify(context));
    } catch {
      // A log line that cannot be serialised must not take the request down.
    }
  }
}
