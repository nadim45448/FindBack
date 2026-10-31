/**
 * The Prisma implementation of the content-removal repository.
 *
 * **The read answers the idempotence question from the data.** Whether a
 * target is already withheld is a fact about the content, read from the
 * content's own row — never asserted by a client. A client that could assert
 * it would be choosing whether its own repeated action produced a second
 * audit record.
 *
 * **The write marks the content withheld; it does not delete it.** The audit
 * trail is append-only with no correction path (ADR-6), so a removal's
 * record names content that must still exist for that record to remain
 * verifiable.
 *
 * **The removal row is inserted in the caller's transaction, before the
 * content is marked.** The order matters: the unique constraint on the
 * target is the second line of defence against a duplicate, and it must
 * refuse *before* the content is touched — so the service calls
 * `recordRemoval` first, and a duplicate raises the constraint error, which
 * rolls the transaction back with the content's mark.
 *
 * Pure — the ports do the I/O.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  ContentRemovalRepository,
  ContentRemovalTargetState,
} from '@/application/listings/ports/content-removal-repository';

import type { ContentRemovalTarget } from '@/domain/moderation';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A removal written outside the
 * transaction that also writes its audit event would leave the trail
 * recording a moderation act that did not commit.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('$queryRaw' in candidate)
  ) {
    throw new Error(
      'A content removal must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's content-removal repository. */
export class PrismaContentRemovalRepository implements ContentRemovalRepository {
  constructor(private readonly client: PrismaClient) {}

  async readTargetState(
    reportId: string,
    target: ContentRemovalTarget,
  ): Promise<ContentRemovalTargetState | null> {
    // ── The target's own row ───────────────────────────────────────────────
    //
    // **Each kind is read from the table it lives on.** A report's image and
    // a thread message are different rows with different shapes, and the
    // reader resolves the kind rather than pretending they are one.
    switch (target.kind) {
      case 'report_image': {
        const report = await this.client.report.findUnique({
          where: { id: target.targetId },
          select: { id: true, imageWithheld: true, imageRef: true },
        });

        if (report === null || report.id !== reportId) {
          return null;
        }

        // **A report with no image has no image to remove.** The target does
        // not exist, and a removal of it would record a moderation act
        // against nothing.
        if (report.imageRef === null) {
          return null;
        }

        return { alreadyRemoved: report.imageWithheld };
      }

      case 'report_description': {
        const report = await this.client.report.findUnique({
          where: { id: target.targetId },
          select: { id: true, descriptionWithheld: true },
        });

        if (report === null || report.id !== reportId) {
          return null;
        }

        return { alreadyRemoved: report.descriptionWithheld };
      }

      case 'thread_message': {
        const message = await this.client.threadMessage.findUnique({
          where: { id: target.targetId },
          select: { id: true, reportId: true, bodyWithheld: true },
        });

        if (message === null || message.reportId !== reportId) {
          return null;
        }

        return { alreadyRemoved: message.bodyWithheld };
      }
    }
  }

  async withholdContent(
    target: ContentRemovalTarget,
    transaction: TransactionHandle,
  ): Promise<void> {
    const client = transactionClient(transaction);

    switch (target.kind) {
      case 'report_image':
        await client.report.updateMany({
          where: { id: target.targetId },
          data: { imageWithheld: true, updatedAt: new Date() },
        });
        return;

      case 'report_description':
        await client.report.updateMany({
          where: { id: target.targetId },
          data: { descriptionWithheld: true, updatedAt: new Date() },
        });
        return;

      case 'thread_message':
        await client.threadMessage.updateMany({
          where: { id: target.targetId },
          data: { bodyWithheld: true },
        });
        return;
    }
  }

  /**
   * Insert the removal row.
   *
   * **Separate from `withholdContent` because the row carries the
   * administrator and the reason,** which the domain's decision produced and
   * the port's `withholdContent` signature does not carry. The service
   * writes the row through this method inside the same transaction as the
   * content's mark, so the two commit together.
   */
  async recordRemoval(
    removal: {
      readonly reportId: string;
      readonly target: ContentRemovalTarget;
      readonly reason: string;
      readonly administratorId: string;
    },
    transaction: TransactionHandle,
  ): Promise<void> {
    const client = transactionClient(transaction);

    await client.contentRemoval.create({
      data: {
        reportId: removal.reportId,
        targetKind: removal.target.kind,
        targetId: removal.target.targetId,
        removalReason: removal.reason,
        removedBy: removal.administratorId,
      },
    });
  }
}
