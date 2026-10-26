/**
 * Classifying a failed write for retry.
 *
 * ADR-7: a failed read-record write is retried on a **transient** failure
 * only, and the classification is a **closed, explicit list**. A failure that
 * is not on the list is a defect, and a defect should surface as a defect
 * rather than be retried three times identically.
 *
 * **Why the list is closed.** An append-only trigger refusal is permanent —
 * it refuses every attempt identically — and a CHECK violation means the data
 * is invalid. Retrying either wastes the request's time and hides the real
 * defect behind repeated identical attempts.
 *
 * This module is pure — it classifies an unknown error value and returns a
 * verdict. It performs no I/O and imports nothing from the database layer, so
 * it is testable without a database.
 */

/** Whether a failed write is worth another attempt. */
export type FailureVerdict = 'retryable' | 'permanent';

/** The Prisma error code for a transaction write conflict or deadlock. */
export const PRISMA_TRANSACTION_CONFLICT = 'P2034';

/**
 * The driver-adapter error kinds that are transient.
 *
 * These come from `@prisma/adapter-pg`'s own mapping: a socket-level failure
 * or a TLS failure is a momentary condition, and a new pooled connection is
 * likely to succeed where the last one did not.
 */
const TRANSIENT_ADAPTER_KINDS: ReadonlySet<string> = new Set([
  'DatabaseNotReachable',
  'ConnectionClosed',
  'SocketTimeout',
  'TlsConnectionError',
  'TooManyConnections',
  'TransactionWriteConflict',
]);

/**
 * The PostgreSQL error codes that are transient.
 *
 * `40001` is serialization failure and `40P01` is a deadlock — PostgreSQL
 * itself asks for a retry on both.
 */
const TRANSIENT_PG_CODES: ReadonlySet<string> = new Set(['40001', '40P01']);

interface ErrorLike {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly meta?: unknown;
}

/** True when the value carries the shape of a Prisma request error. */
function hasCode(error: unknown): error is ErrorLike & { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as ErrorLike).code === 'string'
  );
}

/**
 * Read the driver adapter's cause, if the error carries one.
 *
 * Prisma's model API maps some PostgreSQL errors onto generic messages that
 * do not describe what happened — the append-only trigger's `23001` surfaces
 * as "Foreign key constraint violated". The real cause is preserved in
 * `meta.driverAdapterError.cause`, and this is where the classification reads
 * it from.
 */
function adapterCause(error: unknown): { kind?: unknown; originalCode?: unknown } | null {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return null;
  }

  const meta = (error as ErrorLike).meta;

  if (typeof meta !== 'object' || meta === null || !('driverAdapterError' in meta)) {
    return null;
  }

  const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;

  if (typeof adapterError !== 'object' || adapterError === null || !('cause' in adapterError)) {
    return null;
  }

  const cause = (adapterError as { cause?: unknown }).cause;

  if (typeof cause !== 'object' || cause === null) {
    return null;
  }

  return cause as { kind?: unknown; originalCode?: unknown };
}

/**
 * Classify a failed write.
 *
 * `retryable` means the same statement could plausibly succeed on a second
 * attempt. `permanent` means it would fail identically, and retrying it would
 * waste time and hide the defect.
 */
export function classifyWriteFailure(error: unknown): FailureVerdict {
  // A Prisma transaction write conflict or deadlock. PostgreSQL's own message
  // asks for a retry.
  if (hasCode(error) && error.code === PRISMA_TRANSACTION_CONFLICT) {
    return 'retryable';
  }

  const cause = adapterCause(error);

  if (cause) {
    if (typeof cause.kind === 'string' && TRANSIENT_ADAPTER_KINDS.has(cause.kind)) {
      return 'retryable';
    }

    if (typeof cause.originalCode === 'string' && TRANSIENT_PG_CODES.has(cause.originalCode)) {
      return 'retryable';
    }

    // A known adapter kind that is not on the transient list — a unique
    // constraint violation, a restrict violation, a null violation — is
    // permanent. This is the append-only trigger's case.
    if (typeof cause.kind === 'string' && cause.kind !== 'postgres') {
      return 'permanent';
    }

    if (typeof cause.originalCode === 'string') {
      return 'permanent';
    }
  }

  // A socket-level error that never reached the adapter's mapper.
  if (hasCode(error)) {
    const code = error.code;

    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
      return 'retryable';
    }
  }

  // Anything unrecognised is a defect, not a transient condition.
  return 'permanent';
}

/**
 * The number of attempts a read-record write makes.
 *
 * One initial attempt plus two retries. The bound is deliberately small: the
 * retry is there to clear a transient condition, not to paper over a
 * sustained outage.
 */
export const READ_RECORD_MAX_ATTEMPTS = 3;
