/**
 * Reading the real cause of a database refusal.
 *
 * Prisma's model API maps some PostgreSQL error codes onto a generic message
 * that does not describe what actually happened. A `BEFORE UPDATE OR DELETE`
 * trigger that raises with SQLSTATE `23001` surfaces to Prisma as
 * "Foreign key constraint violated" — a mis-mapping, since no foreign key is
 * involved.
 *
 * The real cause is preserved in `meta.driverAdapterError.cause`, so this
 * helper reads it. It matters for the append-only guarantee: a caller that
 * only sees "foreign key constraint violated" cannot tell a refused tamper
 * from a genuine referential problem, and would report the wrong thing.
 */

interface DriverAdapterCause {
  readonly originalCode?: string;
  readonly originalMessage?: string;
  readonly kind?: string;
}

interface DriverAdapterError {
  readonly name?: string;
  readonly cause?: DriverAdapterCause;
}

interface PrismaErrorLike {
  readonly message?: string;
  readonly code?: string;
  readonly meta?: {
    readonly driverAdapterError?: DriverAdapterError;
  };
}

/** True when the error is a Prisma error carrying a driver-adapter cause. */
function hasDriverAdapterCause(error: unknown): error is PrismaErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'meta' in error &&
    typeof (error as PrismaErrorLike).meta?.driverAdapterError?.cause?.originalMessage === 'string'
  );
}

/**
 * The database's own explanation of a refusal.
 *
 * Prefers the driver adapter's original message, because that is the one
 * that names the trigger or the constraint. Falls back to the Prisma message
 * when there is no driver cause.
 */
export function describeDatabaseError(error: unknown): string {
  if (hasDriverAdapterCause(error)) {
    const cause = error.meta?.driverAdapterError?.cause;
    const code = cause?.originalCode ? ` (SQLSTATE ${cause.originalCode})` : '';

    return `${cause?.originalMessage ?? 'Unknown database error'}${code}`;
  }

  if (error instanceof Error) {
    const firstRealLine = error.message
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('Invalid `prisma'));

    return firstRealLine ?? error.message;
  }

  return String(error);
}
