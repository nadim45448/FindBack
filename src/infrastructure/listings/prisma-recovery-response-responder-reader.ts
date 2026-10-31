/**
 * The Prisma implementation of the Recovery Response responder reader.
 *
 * **The email address is read here and nowhere else.** It travels from this
 * read to the notification, and it is never put on a response, a report, or
 * an audit payload — the same rule the submission path follows for the
 * reporter's address.
 *
 * **The response's responder is joined, not looked up by a second query.**
 * The reader asks for the response and its responder's address in one
 * statement, so the address belongs to the responder of *this* response and
 * not to whatever account happens to share the id.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  RecoveryResponseResponder,
  RecoveryResponseResponderReader,
} from '@/application/listings/ports/recovery-response-responder-reader';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('recoveryResponse' in candidate)) {
    throw new Error(
      'A recovery response must be read inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's Recovery Response responder reader. */
export class PrismaRecoveryResponseResponderReader
  implements RecoveryResponseResponderReader
{
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the responder of a response.
   *
   * @returns the responder, or `null` when no response carries that id.
   */
  async readResponder(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseResponder | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.recoveryResponse.findUnique({
      where: { id: responseId },
      select: { responder: { select: { email: true } } },
    });

    if (found === null) {
      return null;
    }

    return { email: found.responder.email };
  }
}
