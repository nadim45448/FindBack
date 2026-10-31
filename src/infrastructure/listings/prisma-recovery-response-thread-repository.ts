/**
 * The Prisma implementation of the Recovery Response thread repository.
 *
 * **The write is inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter, so the message and the audit
 * event commit together or not at all (ADR-3).
 *
 * **The body is written as its trimmed text.** The domain trimmed it before
 * it measured it, and the write stores exactly what the domain measured — so
 * the row holds the text a reader will see, and the database's
 * `thread_messages_body_length_check` is checking the same string the domain
 * bounded.
 *
 * **The parent kind is the isolation, and the Claim column is left null.**
 * A Recovery Response's thread writes `parent_type = 'recovery_response'` and
 * `parent_id = <the response id>`, and names no Claim at all — because a
 * Recovery Response has no Claim. The database's
 * `thread_messages_parent_claim_consistency_check` says the two are
 * exclusive: a `claim` parent must name a Claim, and a `recovery_response`
 * parent must not. **A row that filed this message under a Claim's thread
 * would be refused by the database itself.**
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  RecoveryResponseThreadRepository,
  StoredRecoveryResponseThreadMessage,
} from '@/application/listings/ports/recovery-response-thread-repository';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A message written outside the
 * caller's transaction could commit without its audit event — and the audit
 * trail is append-only with no correction path (ADR-6), so that error would
 * be permanent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('threadMessage' in candidate)
  ) {
    throw new Error(
      'A recovery response thread message must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's Recovery Response thread repository. */
export class PrismaRecoveryResponseThreadRepository implements RecoveryResponseThreadRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Insert a message into a Recovery Response's thread.
   *
   * **The Claim column is deliberately left null.** The row names a
   * `recovery_response` parent, and the database's consistency constraint
   * refuses a row that names both a parent kind and the other's id.
   */
  async postMessage(
    input: {
      readonly recoveryResponseId: string;
      readonly lostReportId: string;
      readonly authorId: string;
      readonly authorDisplayName: string;
      readonly body: { readonly value: string };
      readonly postedAt: Date;
    },
    transaction: TransactionHandle,
  ): Promise<StoredRecoveryResponseThreadMessage> {
    const client = transactionClient(transaction);

    const created = await client.threadMessage.create({
      data: {
        parentType: 'recovery_response',
        parentId: input.recoveryResponseId,
        // **The Claim column is null for this parent kind,** and the
        // database's `thread_messages_parent_claim_consistency_check`
        // requires it to be.
        claimId: null,
        reportId: input.lostReportId,
        authorId: input.authorId,
        authorDisplayName: input.authorDisplayName,
        body: input.body.value,
        postedAt: input.postedAt,
      },
      select: {
        id: true,
        parentId: true,
        reportId: true,
        authorId: true,
        authorDisplayName: true,
        body: true,
        postedAt: true,
      },
    });

    return {
      id: created.id,
      // **The Response id is the Response id the caller named.** The column
      // is polymorphic by parent — the row's `parent_id` is the Response —
      // so the value is a restatement of a fact the database already
      // enforced through the parent-kind CHECK.
      recoveryResponseId: input.recoveryResponseId,
      lostReportId: created.reportId,
      authorId: created.authorId,
      authorDisplayName: created.authorDisplayName,
      body: { value: created.body, brand: 'recovery-response-thread-message-body' },
      postedAt: created.postedAt,
    };
  }
}

/** The Prisma client type the repository needs. */
export type { Prisma };
