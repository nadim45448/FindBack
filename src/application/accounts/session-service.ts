/**
 * The session service.
 *
 * PRD A2: sessions are revocable server-side rows, not JWTs.
 *
 * **Expiry is enforced on read**, against the stored `expiresAt`, so a
 * session is dead the moment its window elapses — regardless of whether the
 * cleanup sweep has run. Correctness does not depend on a cron job that
 * drifts ±59 minutes (ADR-16).
 *
 * **The activity timestamp is refreshed at most once per hour.** The write
 * volume is therefore one write per active session per hour rather than one
 * write per request, and the effective idle window is 13–14 days rather than
 * exactly 14. The approximation is on the safe side: a session is never
 * revoked early.
 *
 * **A failed refresh must not fail the request.** The timestamp is
 * bookkeeping, not an access-control decision — every explicit security
 * action (logout, deactivation, password reset) is exact and immediate, and
 * none of them depends on this write.
 */

import {
  canAuthenticate,
  createActorContext,
  isActivityRefreshDue,
  isUsableSession,
  issueSession,
  refreshSessionActivity,
  revokeSession,
  type ActorContext,
  type Session,
} from '@/domain/accounts';
import { NotFoundError } from '@/lib/errors';

import type { AccountRepository } from './ports/account-repository';
import type { SessionRepository } from './ports/session-repository';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The session service's configuration. */
export interface SessionServiceOptions {
  /** The inactivity window, in days. */
  readonly inactivityDays?: number;
  /** The activity-refresh threshold, in minutes. */
  readonly refreshThresholdMinutes?: number;
  /**
   * The session token's hash. The plaintext token is returned to the caller
   * for the cookie and is never persisted.
   */
  readonly hashToken: (plaintextToken: string) => string;
  /** Mints a fresh session token. */
  readonly generateToken: () => string;
}

/** The session service. */
export class SessionService {
  private readonly inactivityDays: number;
  private readonly refreshThresholdMinutes: number;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionFactory,
    private readonly options: SessionServiceOptions,
  ) {
    this.inactivityDays = options.inactivityDays ?? 14;
    this.refreshThresholdMinutes = options.refreshThresholdMinutes ?? 60;
  }

  /**
   * Issue a session for an account.
   *
   * Returns the session and the **plaintext token**, which the caller puts
   * in the cookie. The token is never persisted and never audited.
   */
  async issue(
    accountId: string,
    transaction: TransactionHandle,
    now: Date = new Date(),
  ): Promise<{ session: Session; token: string }> {
    const token = this.options.generateToken();
    const tokenHash = this.options.hashToken(token);

    const session = issueSession({
      id: crypto.randomUUID(),
      accountId,
      tokenHash,
      createdAt: now,
      inactivityDays: this.inactivityDays,
    });

    const saved = await this.sessions.save(session, transaction);

    return { session: saved, token };
  }

  /**
   * Resolve a session token into an actor context.
   *
   * Returns `null` for a token that is unknown, revoked, or expired — an
   * expired session cookie is "treated as unauthenticated, no error
   * surfaced" (story 003's edge case), never an error.
   *
   * The status is read from the database on **every** request, so a
   * deactivation takes effect on the next request and a stale cached context
   * is impossible (story 006's edge case).
   */
  async resolve(token: string, now: Date = new Date()): Promise<ActorContext | null> {
    const tokenHash = this.options.hashToken(token);
    const session = await this.sessions.findByTokenHash(tokenHash);

    if (!session || !isUsableSession(session, now)) {
      return null;
    }

    const account = await this.accounts.findById(session.accountId);

    if (!account) {
      return null;
    }

    // **A `Rejected` or `Deactivated` account does not authenticate at
    // all** (FR-4), so its sessions resolve to nothing — the same as an
    // expired or revoked token. Without this check, a session issued
    // before the account was rejected would keep resolving, and the
    // rejected member would keep a live session carrying the account's
    // identity, even though the domain says the account does not
    // authenticate.
    //
    // A `Pending` account **does** authenticate (FR-4) — it keeps its
    // session, and the restriction lives in the context's capability.
    if (!canAuthenticate(account)) {
      return null;
    }

    await this.refreshActivityIfDue(session, now);

    return createActorContext({
      actorId: account.id,
      status: account.status,
      isAdministrator: account.isAdministrator,
      displayName: account.displayName.value,
    });
  }

  /**
   * Find the session behind a token.
   *
   * Used by the logout route, which must revoke the session row rather than
   * only clear the cookie — a revoked token is inert server-side even if the
   * cookie survives in a browser.
   */
  async findByToken(token: string): Promise<Session | null> {
    return this.sessions.findByTokenHash(this.options.hashToken(token));
  }

  /**
   * Revoke a session.
   *
   * **Idempotent** — revoking an already-revoked session succeeds and
   * changes nothing (story 005 criterion 4).
   */
  async revoke(
    sessionId: string,
    reason: string,
    transaction: TransactionHandle,
    now: Date = new Date(),
  ): Promise<Session> {
    const session = await this.sessions.findById(sessionId);

    if (!session) {
      throw new NotFoundError('No session with that id.');
    }

    const revoked = revokeSession(session, reason, now);

    return this.sessions.revoke(revoked.id, reason, transaction, now);
  }

  /**
   * Refresh the activity timestamp, if a refresh is due.
   *
   * The refresh runs in **its own** short transaction, not the caller's: a
   * failed refresh must not roll back the caller's work, and the caller's
   * request is a read that has no transaction to join.
   *
   * **A failure here is swallowed deliberately.** The timestamp is
   * bookkeeping; the access-control decisions have already been made. A
   * failed write must not log a member out of the application, so the
   * failure is caught and the request proceeds with the session as it was.
   */
  private async refreshActivityIfDue(session: Session, now: Date): Promise<void> {
    if (!isActivityRefreshDue(session, now, this.refreshThresholdMinutes)) {
      return;
    }

    const refreshed = refreshSessionActivity(session, now, this.inactivityDays);

    try {
      await this.transactions.run((transaction) => this.sessions.save(refreshed, transaction));
    } catch {
      // The refresh is best-effort. The session stays usable; the stored
      // timestamp is simply a little stale, which means the session may
      // expire a little sooner than the user expects.
    }
  }
}
