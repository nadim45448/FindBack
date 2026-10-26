/**
 * The operational logger port.
 *
 * The log line's shape is fixed by `RequestContext` — a closed type with no
 * field capable of carrying a sensitive value. The port accepts only that
 * type, so the guarantee holds at the boundary as well as in the type.
 */

import type { RequestContext } from '@/domain/audit';

/** Writes one structured log line. */
export interface OperationalLogger {
  log(context: RequestContext): void;
}
