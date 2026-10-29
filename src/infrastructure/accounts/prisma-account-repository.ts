/**
 * The Prisma implementation of the account repository.
 *
 * The domain never sees a row: the Prisma row is mapped to the domain
 * entity here, at the boundary. The mapping is the only place that knows
 * about columns.
 *
 * **The email lookup is case-insensitive**, matching the functional unique
 * index (`lower(btrim(email))`), so a row written by any path is found.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import {
  createDisplayName,
  createEmailAddress,
  createPasswordHash,
  createRejectionReason,
  createSelfDeclaredRole,
  type Account,
} from '@/domain/accounts';
import { isAccountStatus, isSelfDeclaredRole } from '@/domain/accounts';

import type {
  AccountRepository,
  PendingRegistration,
} from '@/application/accounts/ports/account-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The row shape the account table returns. */
interface AccountRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  selfDeclaredRole: string;
  selfDeclaredRoleOther: string | null;
  status: string;
  isAdministrator: boolean;
  rejectionReason: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
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

  if (typeof candidate !== 'object' || candidate === null || !('account' in candidate)) {
    throw new Error('An account write cannot commit outside its caller transaction.');
  }

  return candidate as Prisma.TransactionClient;
}

/**
 * Map a database row onto the domain entity.
 *
 * A status or role the database holds that the domain does not know would
 * be a defect, so it throws rather than defaulting silently.
 */
function toDomainAccount(row: AccountRow): Account {
  if (!isAccountStatus(row.status)) {
    throw new Error(`The account ${row.id} has an unknown status: ${row.status}.`);
  }

  if (!isSelfDeclaredRole(row.selfDeclaredRole)) {
    throw new Error(
      `The account ${row.id} has an unknown self-declared role: ${row.selfDeclaredRole}.`,
    );
  }

  return {
    id: row.id,
    email: createEmailAddress(row.email),
    passwordHash: createPasswordHash(row.passwordHash),
    displayName: createDisplayName(row.displayName),
    selfDeclaredRole: createSelfDeclaredRole(row.selfDeclaredRole, row.selfDeclaredRoleOther),
    status: row.status,
    isAdministrator: row.isAdministrator,
    rejectionReason: createRejectionReason(row.rejectionReason),
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    deactivatedAt: row.deactivatedAt,
  };
}

/** Prisma's account repository. */
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly client: PrismaClient) {}

  async findById(id: string): Promise<Account | null> {
    const row = await this.client.account.findUnique({ where: { id } });

    return row ? toDomainAccount(row) : null;
  }

  /**
   * Find an account by its email address.
   *
   * The lookup is on `lower(btrim(email))` — the same expression the unique
   * index uses — so a row written by any path is found, and the lookup
   * cannot return two accounts.
   */
  async findByEmail(email: string): Promise<Account | null> {
    const rows = await this.client.$queryRaw<AccountRow[]>(Prisma.sql`
      SELECT * FROM "accounts"
      WHERE lower(btrim("email")) = lower(btrim(${email}))
      LIMIT 1
    `);

    const row = rows[0];

    return row ? toDomainAccount(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const rows = await this.client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count FROM "accounts"
      WHERE lower(btrim("email")) = lower(btrim(${email}))
    `);

    return (rows[0]?.count ?? 0n) > 0n;
  }

  /**
   * Persist an account inside the caller's transaction.
   *
   * A create and an update are the same call, and the repository decides
   * which from the row's presence — the domain has one way to change an
   * account's status, and the repository can see whether the row is new.
   */
  async save(account: Account, transaction: TransactionHandle): Promise<Account> {
    const client = transactionClient(transaction);

    const data = {
      email: account.email.value,
      passwordHash: account.passwordHash.value,
      displayName: account.displayName.value,
      selfDeclaredRole: account.selfDeclaredRole.role,
      selfDeclaredRoleOther: account.selfDeclaredRole.otherText,
      status: account.status,
      isAdministrator: account.isAdministrator,
      rejectionReason: account.rejectionReason?.value ?? null,
      activatedAt: account.activatedAt,
      deactivatedAt: account.deactivatedAt,
    };

    const existing = await client.account.findUnique({ where: { id: account.id } });

    const row = existing
      ? await client.account.update({ where: { id: account.id }, data })
      : await client.account.create({ data: { id: account.id, ...data } });

    return toDomainAccount(row);
  }

  /**
   * The pending registrations, oldest first.
   *
   * FR-3's ordering is by submission time.
   */
  async listPending(limit: number): Promise<readonly PendingRegistration[]> {
    const rows = await this.client.account.findMany({
      where: { status: 'Pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map((row) => ({ account: toDomainAccount(row) }));
  }
}
