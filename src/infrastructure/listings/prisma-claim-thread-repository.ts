/**
 * The Prisma implementation of the claim thread repository.
 *
 * **The write is inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter, so the message and the audit
 * event commit together or not at all (ADR-3).
 *
 * **The body is written as its trimmed text.** The domain trimmed it before
 * it measured it, and the write stores exactly what the domain measured —
 * so the row holds the text a reader will see, and the database's
 * `thread_messages_body_length_check` is checking the same string the
 * domain bounded.
 *
 * **The parent columns are written together with the Claim column,** and
 * the database's `thread_messages_parent_id_agrees_check` says they must
 * agree. The repository writes them from one source — the Claim id — so
 * they cannot disagree in the first place.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  ClaimThreadRepository,
  StoredThreadMessage,
} from '@/application/listings/ports/claim-thread-repository';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A message written outside the
 * caller's transaction could commit without its audit event — and the audit
 * trail is append-only with no correction path (ADR-6), so that error
 * would be permanent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('threadMessage' in candidate)
  ) {
    throw new Error(
      'A thread message must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's claim thread repository. */
export class PrismaClaimThreadRepository implements ClaimThreadRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Insert a message into a Claim's thread.
   *
   * **The parent type is written as `claim`,** because this repository
   * writes Claim threads only. The Recovery Response thread is a different
   * parent kind and a different repository's business.
   */
  async postMessage(
    input: {
      readonly claimId: string;
      readonly reportId: string;
      readonly authorId: string;
      readonly authorDisplayName: string;
      readonly body: { readonly value: string };
      readonly postedAt: Date;
    },
    transaction: TransactionHandle,
  ): Promise<StoredThreadMessage> {
    const client = transactionClient(transaction);

    const created = await client.threadMessage.create({
      data: {
        parentType: 'claim',
        parentId: input.claimId,
        claimId: input.claimId,
        reportId: input.reportId,
        authorId: input.authorId,
        authorDisplayName: input.authorDisplayName,
        body: input.body.value,
        postedAt: input.postedAt,
      },
      select: {
        id: true,
        claimId: true,
        reportId: true,
        authorId: true,
        authorDisplayName: true,
        body: true,
        postedAt: true,
      },
    });

    return {
      id: created.id,
      // **The Claim id is the Claim id the caller named.** The column is
      // nullable in Prisma's type because the table is polymorphic by
      // parent — but this repository only ever writes a `claim` parent,
      // and the database's own CHECK constraint says a `claim` parent must
      // carry a `claim_id`. The value is therefore not a fallback but a
      // restatement of a fact the database already enforced.
      claimId: input.claimId,
      reportId: created.reportId,
      authorId: created.authorId,
      authorDisplayName: created.authorDisplayName,
      body: { value: created.body, brand: 'claim-thread-message-body' },
      postedAt: created.postedAt,
    };
  }
}
