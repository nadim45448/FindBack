/**
 * The pending-registrations query.
 *
 * FR-3: the administrator's queue shows the pending registrations, **each
 * entry showing name, email, self-declared role, and registration
 * timestamp**.
 *
 * The ordering is by submission time — the PRD names it, and it is the
 * order an administrator works through the queue in.
 *
 * Read-only. The screen itself is Unit 007's; this is the data contract
 * behind it.
 */

import type { PendingRegistration } from './ports/account-repository';
import type { AccountRepository } from './ports/account-repository';

/** The page size the queue is capped at. */
export const PENDING_REGISTRATIONS_PAGE_SIZE = 25;

/** The pending-registrations query. */
export class RegistrationQueueQuery {
  constructor(private readonly accounts: AccountRepository) {}

  /**
   * The pending registrations, oldest first.
   *
   * The page is capped, because a queue that returns everything is a queue
   * that times out.
   */
  async listPending(
    limit: number = PENDING_REGISTRATIONS_PAGE_SIZE,
  ): Promise<readonly PendingRegistration[]> {
    return this.accounts.listPending(limit);
  }
}
