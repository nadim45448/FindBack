/**
 * The content-removal repository — the reads and writes of FR-36's
 * moderation.
 *
 * **Two operations, and the first exists to make the second idempotent.**
 *
 * The read tells the service whether the target is **already withheld**, so
 * that a repeated removal records no second audit entry. The write marks the
 * content withheld.
 *
 * **The write withholds; it does not delete.** The audit trail is
 * append-only (ADR-6) and has no correction path, so a record naming
 * removed content must remain verifiable — which means the content it names
 * must still exist.
 *
 * **The write takes the transaction handle** for the same reason every
 * other write in this codebase does: the withdrawal of the content and the
 * audit record that describes it are one act, and the trail cannot record
 * something that then failed to commit.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ContentRemovalTarget } from '@/domain/moderation';

/** The state of a removal target. */
export interface ContentRemovalTargetState {
  /**
   * Whether the content is already withheld.
   *
   * **Read from the content's own row,** so that the idempotence rule
   * depends on the true state of the content rather than on anything the
   * caller said.
   */
  readonly alreadyRemoved: boolean;
}

/**
 * Reads and writes removed content.
 */
export interface ContentRemovalRepository {
  /**
   * Read the target's current state.
   *
   * @returns the state, or `null` when the target does not exist on the
   * report.
   */
  readTargetState(
    reportId: string,
    target: ContentRemovalTarget,
  ): Promise<ContentRemovalTargetState | null>;

  /**
   * Mark the content withheld.
   *
   * **Idempotent at the data layer too.** A repeated call leaves the content
   * withheld and writes nothing new, so the second line of defence matches
   * the first.
   */
  withholdContent(
    target: ContentRemovalTarget,
    transaction: TransactionHandle,
  ): Promise<void>;

  /**
   * Insert the removal row — the record of the moderation act.
   *
   * **The unique constraint on the target is the second line of defence
   * against a duplicate.** The row goes in before the content is marked, so
   * a repeated removal is refused by the constraint and the transaction rolls
   * back with the content's mark.
   *
   * @throws {Prisma.PrismaClientKnownRequestError} with code `P2002` when a
   * removal already exists for the target.
   */
  recordRemoval(
    removal: {
      readonly reportId: string;
      readonly target: ContentRemovalTarget;
      readonly reason: string;
      readonly administratorId: string;
    },
    transaction: TransactionHandle,
  ): Promise<void>;
}
