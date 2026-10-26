/**
 * The transaction handle every audit write requires.
 *
 * **The handle is a required parameter, never an optional one.** That is the
 * type-level form of "an audit write cannot commit outside its caller's
 * transaction" — a missing handle is a compile error, not a runtime branch.
 *
 * The handle is deliberately minimal: it exposes only what an insert needs.
 * It cannot be used to update or delete, because the repository interfaces
 * that consume it expose no such method.
 */
export interface TransactionHandle {
  /** A marker for the transaction client, used by the infrastructure layer. */
  readonly transaction: unknown;
}

/**
 * A transaction handle is anything the infrastructure layer recognises as its
 * transaction client.
 *
 * Kept in the application layer so the writer can accept a handle without
 * importing Prisma.
 */
export function isTransactionHandle(value: unknown): value is TransactionHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'transaction' in value &&
    (value as { transaction: unknown }).transaction !== undefined
  );
}
