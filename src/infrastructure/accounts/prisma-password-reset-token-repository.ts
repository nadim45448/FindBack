/**
 * The Prisma implementation of the password-reset-token repository.
 *
 * **`markUsed` is a conditional write, and it is the mechanism.** The
 * `UPDATE` carries its condition in the `WHERE` clause, so PostgreSQL
 * evaluates "is it still unused and unexpired?" and "mark it used" as **one
 * atomic statement**. There is no window between the two in which a
 * concurrent replay could slip through — which is exactly the race a
 * read-then-write implementation would have.
 *
 * **The token is looked up by its digest only.** There is no `findById` on
 * the request path, so a caller cannot address a token without presenting
 * its secret.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { PasswordResetToken } from '@/domain/accounts';

import type { PasswordResetTokenRepository } from '@/application/accounts/ports/password-reset-token-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The row shape the token table returns. */
interface PasswordResetTokenRow {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is refused rather than
 * silently falling back to the root client — a write that commits outside
 * the caller's transaction is a defect the transaction discipline exists to
 * prevent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('passwordResetToken' in candidate)
  ) {
    throw new Error('A reset token write cannot commit outside its caller transaction.');
  }

  return candidate as Prisma.TransactionClient;
}

/** Map a database row onto the domain entity. */
function toDomainToken(row: PasswordResetTokenRow): PasswordResetToken {
  return {
    id: row.id,
    accountId: row.accountId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
  };
}

/** Prisma's password-reset-token repository. */
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.client.passwordResetToken.findUnique({ where: { tokenHash } });

    return row ? toDomainToken(row) : null;
  }

  async save(
    token: PasswordResetToken,
    transaction: TransactionHandle,
  ): Promise<PasswordResetToken> {
    const client = transactionClient(transaction);

    const row = await client.passwordResetToken.create({
      data: {
        id: token.id,
        accountId: token.accountId,
        tokenHash: token.tokenHash,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
      },
    });

    return toDomainToken(row);
  }

  /**
   * Mark a token used, conditionally, and report whether it happened.
   *
   * **The write is the check.** The condition — `used_at IS NULL` and
   * `expires_at > now` — lives in the `WHERE` clause, so the row is updated
   * if and only if the token was both unused and unexpired at the moment the
   * statement ran.
   *
   * A **parameterized** raw `UPDATE`, because the ORM's update builder
   * cannot express a conditional update that reports whether it matched.
   */
  async markUsed(
    tokenId: string,
    transaction: TransactionHandle,
    now: Date,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    const updated = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "PasswordResetToken"
         SET "usedAt" = ${now}
       WHERE "id" = ${tokenId}::uuid
         AND "usedAt" IS NULL
         AND "expiresAt" > ${now}
      RETURNING "id"
    `);

    return updated.length > 0;
  }
}
