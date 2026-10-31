/**
 * The Prisma implementation of the Recovery Response thread reader.
 *
 * **The subject read is one query, and it is one query because the facts
 * must agree.** A Response's status, the report's status, the responder's id,
 * and the report owner's id are four facts about one item. Reading them
 * separately would be four snapshots, and a thread gate that read a
 * `Submitted` Response and then a `Closed` report would be a gate that read a
 * state that never existed.
 *
 * **The history read filters on the parent pair, not on a column of its
 * own.** The `parent_type`/`parent_id` pair is what the visibility reader in
 * `prisma-thread-visibility-reader.ts` filters on, and this read uses the
 * same pair — so a message can never leak across threads by a path that
 * filtered on the wrong column.
 *
 * **The read carries no Sensitive Field.** The Response's where-found, its
 * observed identifying details, and its date found are FR-44's fields, and
 * the `select` below does not ask for them. The subject has no field for
 * them, so there is no argument through which they could leak.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  RecoveryResponseThreadReader,
  RecoveryResponseThreadSubject,
  RecoveryResponseThreadMessageView,
} from '@/application/listings/ports/recovery-response-thread-reader';

import type { ReportStatus } from '@/domain/listings';
import type { RecoveryResponseStatus } from '@/domain/recovery';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('recoveryResponse' in candidate)
  ) {
    throw new Error(
      'A recovery response thread must be read inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's Recovery Response thread reader. */
export class PrismaRecoveryResponseThreadReader implements RecoveryResponseThreadReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the Recovery Response's thread subject.
   *
   * **The report's owner is the Lost-report owner.** The Response was made
   * against a Lost report, and the member who reported it is the member the
   * thread is shared with — that is the second participant in
   * `decideRecoveryResponseThreadParticipation`.
   *
   * @returns the subject, or `null` when no Recovery Response carries that id.
   */
  async readThreadSubject(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseThreadSubject | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.recoveryResponse.findUnique({
      where: { id: responseId },
      select: {
        id: true,
        reportId: true,
        status: true,
        responderId: true,
        report: { select: { id: true, status: true, reporterId: true } },
      },
    });

    if (found === null) {
      return null;
    }

    return {
      recoveryResponseId: found.id,
      lostReportId: found.reportId,
      responseStatus: found.status as RecoveryResponseStatus,
      reportStatus: found.report.status as ReportStatus,
      responderId: found.responderId,
      lostReportOwnerId: found.report.reporterId,
    };
  }

  /**
   * Read the Recovery Response's thread, oldest message first.
   *
   * **The filter is on the parent pair.** `parent_type =
   * 'recovery_response'` and `parent_id = <the response id>` — the same pair
   * the visibility reader uses, so the two readers can never disagree about
   * which messages belong to which thread.
   */
  async listThreadMessages(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<readonly RecoveryResponseThreadMessageView[]> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const rows = await client.threadMessage.findMany({
      where: { parentType: 'recovery_response', parentId: responseId },
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
   * **The name is captured at the moment of posting,** so the thread reads as
   * a conversation that does not change its wording every time an account is
   * renamed.
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
