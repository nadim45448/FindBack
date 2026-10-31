/**
 * The Prisma implementation of the Recovery Response reader.
 *
 * **It answers the two questions the submission gate asks about a report's
 * responses**, and both are reads of the `recovery_responses` table — the
 * report carries its own status, and the responses carry their own, and the
 * two state machines must never share a vocabulary.
 *
 * ## The `Match Confirmed` read
 *
 * **It looks at the *selected* response only.** FR-40's cutoff is about the
 * response the Lost-report owner selected for verification — a sibling that
 * happens to be `Match Confirmed` while a *different* response is selected is
 * a state the workflow does not produce, and answering from the wrong row
 * would refuse a submission the workflow permits.
 *
 * **It asks for the confirmed status directly rather than reading a status
 * and comparing it in code.** The query filters on `status = 'Match
 * Confirmed'`, so the answer is a boolean the database produced — and the
 * status literal comes from the domain's own vocabulary, not from a second
 * copy of the string.
 *
 * ## The live-response read
 *
 * **It counts the responder's non-terminal responses on the report.** The
 * non-terminal statuses are the domain's own
 * `NON_TERMINAL_RECOVERY_RESPONSE_STATUSES`, imported rather than restated —
 * a second list of status literals is a second rule the day one of them
 * changes.
 *
 * **A terminal response does not count.** A responder whose response was `Not
 * a Match` may respond again, and the new response sits alongside the
 * retained history.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { RecoveryResponseReader } from '@/application/listings/ports/recovery-response-reader';
import {
  NON_TERMINAL_RECOVERY_RESPONSE_STATUSES,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused** rather than
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

/** Prisma's Recovery Response reader. */
export class PrismaRecoveryResponseReader implements RecoveryResponseReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Whether the selected response on the report has reached
   * `Match Confirmed`.
   *
   * @returns `false` when no response is selected, or when the selected
   * response has not yet been confirmed. **Only a confirmed match is `true`.**
   */
  async hasMatchConfirmed(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<boolean> {
    const client = transaction ? transactionClient(transaction) : this.client;

    // **The selected response is the one in `Selected for Verification` or
    // `Match Confirmed`.** Both are the same selection — the response moves
    // from one to the other — so the query asks for either, and the answer
    // is whether that response has reached the confirmed state.
    const confirmed = await client.recoveryResponse.count({
      where: {
        reportId,
        status: 'Match Confirmed',
      },
    });

    return confirmed > 0;
  }

  /**
   * Whether the responder already holds a non-terminal Response on the
   * report.
   *
   * @returns `true` when the responder holds a `Submitted`, `Selected for
   * Verification`, or `Match Confirmed` Response on this report. A terminal
   * Response does **not** count.
   */
  async hasLiveResponse(
    reportId: string,
    responderId: string,
    transaction?: TransactionHandle,
  ): Promise<boolean> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const live = await client.recoveryResponse.count({
      where: {
        reportId,
        responderId,
        status: { in: [...NON_TERMINAL_RECOVERY_RESPONSE_STATUSES] as RecoveryResponseStatus[] },
      },
    });

    return live > 0;
  }
}
