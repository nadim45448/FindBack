/**
 * The Prisma implementation of the session repository.
 *
 * Sessions are **revocable server-side rows** (PRD A2), so the revocation
 * path is a real write inside the caller's transaction — a logout that
 * committed its revocation separately from the request would be a logout that
 * could be half-done.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { Session } from '@/domain/accounts';

import type { SessionRepository } from '@/application/accounts/ports/session-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The row shape the session table returns. */
interface SessionRow {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
}

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is refused rather than
 * silently falling back to the root client.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('session' in candidate)) {
    throw new Error('A session write cannot commit outside its caller transaction.');
  }

  return candidate as Prisma.TransactionClient;
}

/** Map a database row onto the domain entity. */
function toDomainSession(row: SessionRow): Session {
  return {
    id: row.id,
    accountId: row.accountId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revocationReason: row.revocationReason,
  };
}

/** Prisma's session repository. */
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const row = await this.client.session.findUnique({ where: { tokenHash } });

    return row ? toDomainSession(row) : null;
  }

  async findById(id: string): Promise<Session | null> {
    const row = await this.client.session.findUnique({ where: { id } });

    return row ? toDomainSession(row) : null;
  }

  /**
   * The account's sessions that are still usable.
   *
   * Both conditions are applied in the query — the revoked ones and the
   * expired ones — so the caller receives only sessions that can act.
   */
  async listActiveByAccount(accountId: string, now: Date): Promise<readonly Session[]> {
    const rows = await this.client.session.findMany({
      where: {
        accountId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    return rows.map(toDomainSession);
  }

  /**
   * Persist a session inside the caller's transaction.
   *
   * A create and an update are the same call, decided by the row's
   * presence.
   */
  async save(session: Session, transaction: TransactionHandle): Promise<Session> {
    const client = transactionClient(transaction);

    const data = {
      accountId: session.accountId,
      tokenHash: session.tokenHash,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      revocationReason: session.revocationReason,
    };

    const existing = await client.session.findUnique({ where: { id: session.id } });

    const row = existing
      ? await client.session.update({ where: { id: session.id }, data })
      : await client.session.create({ data: { id: session.id, ...data } });

    return toDomainSession(row);
  }

  /**
   * Revoke a session inside the caller's transaction.
   *
   * **Idempotent** — an already-revoked session keeps its original
   * revocation time and reason, because the first revocation is the
   * truthful one and a second logout must not rewrite history.
   */
  async revoke(
    sessionId: string,
    reason: string,
    transaction: TransactionHandle,
    now: Date,
  ): Promise<Session> {
    const client = transactionClient(transaction);

    const existing = await client.session.findUnique({ where: { id: sessionId } });

    if (!existing) {
      throw new Error('No session with that id.');
    }

    if (existing.revokedAt !== null) {
      return toDomainSession(existing);
    }

    const row = await client.session.update({
      where: { id: sessionId },
      data: { revokedAt: now, revocationReason: reason },
    });

    return toDomainSession(row);
  }
}
