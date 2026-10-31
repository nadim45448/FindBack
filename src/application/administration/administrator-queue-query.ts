/**
 * The administrator queue query — §15.2–§15.5.
 *
 * ## Each queue lists exactly its own work
 *
 * The four queues are **four filters**, and the filter is the queue's
 * membership rule from the domain. A Found report can never appear in the
 * Lost-side verification queue, and a Lost report can never appear in the
 * Found-side awaiting-return queue, because the filter names the report's
 * type.
 *
 * ## The authorisation is upstream
 *
 * A queue is administrator-only, and the check happens **here, before the
 * query**. A non-administrator receives no rows and no count.
 *
 * ## The queue returns its own rows, not the union
 *
 * The reader returns a discriminated union, and this use case narrows it to
 * the queue's own kind. A queue that returned the union's members would
 * carry fields from the other queues, and the row shape is part of the
 * queue's contract.
 *
 * ## The count is the number of rows
 *
 * **The queue reports its own length.** A tile whose count came from a
 * separate query could disagree with the queue it points at; the count
 * here is the count the dashboard reads through the same filter.
 *
 * Pure orchestration — the port does the I/O.
 */

import { PermissionDeniedError } from '@/lib/errors';

import {
  OPERATIONAL_QUEUE_FILTERS,
  type OperationalQueueId,
} from '@/domain/administration';

import type {
  AwaitingReturnRow,
  PendingClaimRow,
  PendingRegistrationRow,
  QueueReader,
  VerificationRow,
} from './ports/queue-reader';

/** The page size every queue is capped at. */
export const ADMINISTRATOR_QUEUE_PAGE_SIZE = 25;

/**
 * Who is asking for a queue.
 */
export interface QueueViewer {
  readonly userId: string;
  readonly isAdministrator: boolean;
}

/** The Pending Registrations queue's result. */
export interface PendingRegistrationsQueue {
  readonly queue: 'pending-registrations';
  readonly rows: readonly PendingRegistrationRow[];
  readonly count: number;
}

/** The Pending Claims queue's result. */
export interface PendingClaimsQueue {
  readonly queue: 'pending-claims';
  readonly rows: readonly PendingClaimRow[];
  readonly count: number;
}

/** The Items Awaiting Return queue's result. */
export interface AwaitingReturnQueue {
  readonly queue: 'awaiting-return';
  readonly rows: readonly AwaitingReturnRow[];
  readonly count: number;
}

/** The Items in Verification queue's result. */
export interface VerificationsQueue {
  readonly queue: 'verifications';
  readonly rows: readonly VerificationRow[];
  readonly count: number;
}

/**
 * The union of the four queues' results.
 */
export type AdministratorQueue =
  | PendingRegistrationsQueue
  | PendingClaimsQueue
  | AwaitingReturnQueue
  | VerificationsQueue;

/**
 * Reads the four operational queues.
 */
export class AdministratorQueueQuery {
  constructor(private readonly queues: QueueReader) {}

  /**
   * Read a queue.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   */
  async read(
    viewer: QueueViewer,
    queue: OperationalQueueId,
    limit: number = ADMINISTRATOR_QUEUE_PAGE_SIZE,
  ): Promise<AdministratorQueue> {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read the queues.');
    }

    const page = await this.queues.read(OPERATIONAL_QUEUE_FILTERS[queue], limit);

    switch (queue) {
      case 'pending-registrations':
        return {
          queue,
          rows: page.rows
            .filter((row) => row.kind === 'PendingRegistration')
            .map((row) => ({
              accountId: row.accountId,
              displayName: row.displayName,
              email: row.email,
              selfDeclaredRole: row.selfDeclaredRole,
              registeredAt: row.registeredAt,
            })),
          count: page.count,
        };

      case 'pending-claims':
        return {
          queue,
          rows: page.rows
            .filter((row) => row.kind === 'PendingClaim')
            .map((row) => ({
              claimId: row.claimId,
              reportId: row.reportId,
              itemName: row.itemName,
              claimantDisplayName: row.claimantDisplayName,
              submittedAt: row.submittedAt,
            })),
          count: page.count,
        };

      case 'awaiting-return':
        return {
          queue,
          rows: page.rows
            .filter((row) => row.kind === 'AwaitingReturn')
            .map((row) => ({
              reportId: row.reportId,
              itemName: row.itemName,
              claimantName: row.claimantName,
              approvedAt: row.approvedAt,
            })),
          count: page.count,
        };

      case 'verifications':
        return {
          queue,
          rows: page.rows
            .filter((row) => row.kind === 'Verification')
            .map((row) => ({
              reportId: row.reportId,
              reportName: row.reportName,
              ownerDisplayName: row.ownerDisplayName,
              ownerUserId: row.ownerUserId,
              selectedResponderDisplayName: row.selectedResponderDisplayName,
              verificationStartedAt: row.verificationStartedAt,
            })),
          count: page.count,
        };
    }
  }
}
