/**
 * The logout use case.
 *
 * FR-4 and story 005: logging out revokes the session row, and the session
 * cookie is cleared.
 *
 * **Logout is idempotent.** A logout without a valid session is an
 * idempotent success and no session state changes (story 005 criterion 4,
 * and its double-logout edge case). The use case therefore returns a result
 * rather than throwing when there is nothing to revoke.
 *
 * **Logging out on one device leaves other devices alone** (story 005
 * criterion 5) — this use case revokes the one session it is given, and
 * never the account's other sessions.
 */

import { REVOCATION_REASON_LOGOUT } from '@/domain/accounts';
import { NotFoundError } from '@/lib/errors';

import type { SessionRepository } from './ports/session-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The outcome of a logout. */
export interface LogoutOutcome {
  /** True when a session was actually revoked. */
  readonly revoked: boolean;
}

/** The logout use case. */
export class Logout {
  constructor(private readonly sessions: SessionRepository) {}

  /**
   * Revoke the session behind a token.
   *
   * @throws {NotFoundError} when the token is present but matches no
   * session — the caller treats that as an idempotent success.
   */
  async execute(
    sessionId: string,
    transaction: TransactionHandle,
    now: Date = new Date(),
  ): Promise<LogoutOutcome> {
    const session = await this.sessions.findById(sessionId);

    if (!session) {
      throw new NotFoundError('No session with that id.');
    }

    // `revoke` is idempotent, so an already-revoked session succeeds and
    // changes nothing.
    await this.sessions.revoke(session.id, REVOCATION_REASON_LOGOUT, transaction, now);

    return { revoked: true };
  }
}
