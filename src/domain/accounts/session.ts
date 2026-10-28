/**
 * The `Session` aggregate root.
 *
 * **A database row, not a JWT** (PRD A2). Logout, deactivation, and password
 * reset must all be able to revoke server-side, and only a row can be
 * revoked.
 *
 * The invariants:
 *
 * 1. A new session belongs to an `Active` **or** `Pending` account — a
 *    `Pending` account authenticates (FR-4) but gains no member capability
 *    (FR-2). It never belongs to a `Rejected` or `Deactivated` account:
 *    those do not authenticate at all.
 * 2. `revoke()` is terminal and idempotent.
 * 3. A revoked session is not also expired — the two are mutually exclusive
 *    in practice — and `isUsable()` is false if either is set.
 * 4. The token is hashed at construction; the plaintext is not retained.
 *
 * **The inactivity window is refreshed at most once per hour** (ADR-16), so
 * the effective idle window is 13–14 days rather than exactly 14. The
 * approximation is on the safe side — a session is never revoked early.
 * Every *explicit* revocation (logout, deactivation, password reset) is
 * exact and immediate; the threshold touches only the housekeeping timer.
 *
 * Pure — no I/O, no framework imports.
 */

import { IllegalTransitionError } from '@/lib/errors';

/** The default inactivity window, in days (FR-4). */
export const DEFAULT_INACTIVITY_DAYS = 14;

/** The default activity-refresh threshold, in minutes (ADR-16). */
export const DEFAULT_REFRESH_THRESHOLD_MINUTES = 60;

/**
 * The revocation reason for a session ended by an account deactivation
 * (FR-5).
 *
 * **A value, not a schema change.** The `revocationReason` column already
 * exists; this is one more literal the domain recognises.
 */
export const REVOCATION_REASON_ACCOUNT_DEACTIVATED = 'account_deactivated';

/**
 * The revocation reason for a session ended by an explicit logout.
 */
export const REVOCATION_REASON_LOGOUT = 'logout';

/** The session's own state. */
export interface Session {
  readonly id: string;
  readonly accountId: string;
  /** The SHA-256 of the session token. The plaintext is never retained. */
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revocationReason: string | null;
}

/** The fields a new session is created with. */
export interface IssueSessionParams {
  readonly id: string;
  readonly accountId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  /** The inactivity window, in days. */
  readonly inactivityDays?: number;
}

/**
 * Issue a session.
 *
 * The expiry is computed from the creation time and the inactivity window.
 */
export function issueSession(params: IssueSessionParams): Session {
  const inactivityDays = params.inactivityDays ?? DEFAULT_INACTIVITY_DAYS;
  const expiresAt = new Date(params.createdAt.getTime() + inactivityDays * 24 * 60 * 60 * 1000);

  return {
    id: params.id,
    accountId: params.accountId,
    tokenHash: params.tokenHash,
    createdAt: params.createdAt,
    lastActivityAt: params.createdAt,
    expiresAt,
    revokedAt: null,
    revocationReason: null,
  };
}

/**
 * Revoke a session.
 *
 * **Terminal and idempotent.** Revoking an already-revoked session returns it
 * unchanged rather than throwing, because logout must be an idempotent
 * success (story 005 criterion 4, and its double-logout edge case).
 */
export function revokeSession(session: Session, reason: string, at: Date): Session {
  if (session.revokedAt !== null) {
    return session;
  }

  return {
    ...session,
    revokedAt: at,
    revocationReason: reason,
  };
}

/**
 * True when the session may still be used.
 *
 * Checked on **every** session resolution, so a revoked session is inert
 * immediately and an expired one is dead the moment its window elapses —
 * regardless of whether a cleanup job has run (ADR-16).
 */
export function isUsableSession(session: Session, now: Date): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}

/**
 * True when the session's activity timestamp is due for a refresh.
 *
 * The threshold is what keeps the write volume at one write per session per
 * hour rather than one write per request.
 */
export function isActivityRefreshDue(
  session: Session,
  now: Date,
  thresholdMinutes: number = DEFAULT_REFRESH_THRESHOLD_MINUTES,
): boolean {
  const elapsedMs = now.getTime() - session.lastActivityAt.getTime();

  return elapsedMs >= thresholdMinutes * 60 * 1000;
}

/**
 * Refresh a session's activity timestamp.
 *
 * Only called when `isActivityRefreshDue` says a refresh is due. The expiry
 * moves with it, so the window is measured from the last activity.
 */
export function refreshSessionActivity(
  session: Session,
  now: Date,
  inactivityDays: number = DEFAULT_INACTIVITY_DAYS,
): Session {
  return {
    ...session,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + inactivityDays * 24 * 60 * 60 * 1000),
  };
}

/**
 * The idle window a session actually has, given the last recorded activity.
 *
 * Exposed so the approximation is a **measurable** property rather than an
 * accident: the effective window is the configured window minus up to one
 * refresh threshold, and a test asserts its bounds.
 */
export function effectiveIdleWindowDays(
  inactivityDays: number = DEFAULT_INACTIVITY_DAYS,
  thresholdMinutes: number = DEFAULT_REFRESH_THRESHOLD_MINUTES,
): { readonly minDays: number; readonly maxDays: number } {
  const thresholdDays = thresholdMinutes / (60 * 24);

  return {
    minDays: inactivityDays - thresholdDays,
    maxDays: inactivityDays,
  };
}

/**
 * Guard against a session whose expiry precedes its creation.
 *
 * A genuine defect — a session that is born expired would make every
 * resolution fail — so it throws rather than degrading.
 */
export function assertSessionExpiryIsValid(session: Session): void {
  if (session.expiresAt.getTime() <= session.createdAt.getTime()) {
    throw new IllegalTransitionError('A session must expire after it was created.');
  }
}
