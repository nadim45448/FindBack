/**
 * The Prisma implementation of the claim thread reader.
 *
 * **The subject read is one query, and it is one query because the facts
 * must agree.** A Claim's status, the report's status, the claimant's id,
 * and the report owner's id are four facts about one item. Reading them
 * separately would be four snapshots, and a thread gate that read a
 * `Pending` Claim and then a `Closed` report would be a gate that read a
 * state that never existed.
 *
 * **The history read filters on the parent, not on the Claim column.**
 * The `parent_type`/`parent_id` pair is what the visibility reader in
 * `prisma-thread-visibility-reader.ts` filters on, and this read uses the
 * same pair — so a message can never leak across threads by a path that
 * filtered on the wrong column.
 *
 * **The email address is read here and nowhere else.** It travels with the
 * subject, from this read to the notification, and it is never put on a
 * Claim, a thread message, or an audit payload.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  ClaimThreadReader,
  ClaimThreadSubject,
  ThreadMessageView,
} from '@/application/listings/ports/claim-thread-reader';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('claim' in candidate)) {
    throw new Error(
      'A claim thread must be read inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's claim thread reader. */
export class PrismaClaimThreadReader implements ClaimThreadReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the Claim's thread subject.
   *
   * **The report's owner is the finder.** A Claim is made against a Found
   * report, and the member who reported it is the member the thread is
   * shared with — that is the second participant in
   * `decideClaimThreadParticipation`.
   *
   * @returns the subject, or `null` when no Claim carries that id.
   */
  async readThreadSubject(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<ClaimThreadSubject | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        status: true,
        reportId: true,
        claimant: { select: { id: true, email: true } },
        report: { select: { id: true, status: true, reporterId: true } },
      },
    });

    if (found === null) {
      return null;
    }

    return {
      claimId: found.id,
      reportId: found.reportId,
      claimStatus: found.status as ClaimThreadSubject['claimStatus'],
      reportStatus: found.report.status as ClaimThreadSubject['reportStatus'],
      claimantId: found.claimant.id,
      foundReportOwnerId: found.report.reporterId,
      claimantEmail: found.claimant.email,
    };
  }

  /**
   * Read the Claim's thread, oldest message first.
   *
   * **The filter is on the parent pair.** `parent_type = 'claim'` and
   * `parent_id = <the claim id>` — the same pair the visibility reader
   * uses, so the two readers can never disagree about which messages
   * belong to which thread.
   */
  async listThreadMessages(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<readonly ThreadMessageView[]> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const rows = await client.threadMessage.findMany({
      where: { parentType: 'claim', parentId: claimId },
      orderBy: { postedAt: 'asc' },
      select: {
        id: true,
        authorId: true,
        authorDisplayName: true,
        body: true,
        postedAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      authorId: row.authorId,
      authorDisplayName: row.authorDisplayName,
      body: row.body,
      postedAt: row.postedAt.toISOString(),
    }));
  }

  /**
   * Read the posting member's display name.
   *
   * **The name is captured at the moment of posting,** so the thread reads
   * as a conversation that does not change its wording every time an
   * account is renamed.
   *
   * @returns the display name, or `null` when no account carries that id.
   */
  async readAuthorDisplayName(
    authorId: string,
    transaction?: TransactionHandle,
  ): Promise<string | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.account.findUnique({
      where: { id: authorId },
      select: { displayName: true },
    });

    return found === null ? null : found.displayName;
  }
}

/** The Prisma client type the reader needs. */
export type { Prisma };
