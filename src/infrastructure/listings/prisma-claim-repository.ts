/**
 * The Prisma implementation of the claim repository.
 *
 * **The id is minted by the database, once.** The `ValidatedClaim` that
 * arrives has no `id`; the `PersistedClaim` that leaves has one. The
 * repository does not invent an id — the column's default does, so the id
 * cannot be supplied by a caller.
 *
 * **The write is inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter, so the Claim, the report's
 * move to `Claim Requested`, and the audit event commit together or not at
 * all (ADR-3).
 *
 * **The uniqueness violation is translated.** The
 * `uq_claims_one_pending_per_report_per_claimant` index refuses a second
 * `Pending` Claim from the same member on the same report, and PostgreSQL
 * raises it as a generic driver error. The repository turns that into a
 * `DuplicatePendingClaimError`, so the application layer's refusal carries
 * the member's own message rather than a Prisma error code — and so the
 * **untranslated** case (the constraint firing where the application check
 * did not) is still a *business* outcome and not a 500.
 *
 * **The Sensitive Fields are written here and read back through their own
 * constructors.** The `reason` and `identifying_details` columns are
 * populated on insert; a row read back is rebuilt through
 * `createClaimReason` and `createClaimIdentifyingDetails`, so a row holding
 * an out-of-bounds value is **refused** rather than carried into the domain
 * unchecked.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import { DuplicatePendingClaimError } from '@/application/listings/ports/claim-repository';
import type { ClaimDateLost, PersistedClaim, ValidatedClaim } from '@/domain/listings';
import { createClaimIdentifyingDetails, createClaimReason } from '@/domain/listings';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A Claim written outside the
 * caller's transaction could commit without its audit event or without the
 * report's status change — and the audit trail is append-only with no
 * correction path (ADR-6), so that error would be permanent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('claim' in candidate)) {
    throw new Error(
      'A claim must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The row shape the reads select. */
interface ClaimRow {
  id: string;
  reportId: string;
  claimantId: string;
  status: string;
  reason: string | null;
  identifyingDetails: string | null;
  dateLost: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The columns a read selects. */
const CLAIM_COLUMNS = {
  id: true,
  reportId: true,
  claimantId: true,
  status: true,
  reason: true,
  identifyingDetails: true,
  dateLost: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * The PostgreSQL error code for a unique-constraint violation.
 *
 * **23505** is `unique_violation`. It is the driver's own code, and Prisma
 * surfaces it on the error's `code` property.
 */
const UNIQUE_VIOLATION = 'P2002';

/** Prisma's claim repository. */
export class PrismaClaimRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Insert a Claim inside the caller's transaction and return it with its
   * minted id.
   *
   * @throws {DuplicatePendingClaimError} when the uniqueness constraint
   * refuses a second `Pending` Claim from this member on this report.
   */
  async create(
    claim: ValidatedClaim,
    transaction: TransactionHandle,
  ): Promise<PersistedClaim> {
    const client = transactionClient(transaction);

    try {
      const created = await client.claim.create({
        data: {
          reportId: claim.reportId,
          claimantId: claim.claimantId,
          status: claim.status,
          reason: claim.reason.value,
          identifyingDetails: claim.identifyingDetails.value,
          dateLost: claim.dateLost.value,
          submittedAt: claim.submittedAt,
          createdAt: claim.createdAt,
          updatedAt: claim.updatedAt,
        },
        select: CLAIM_COLUMNS,
      });

      return toPersistedClaim(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicatePendingClaimError(
          'You already have a claim pending on this item.',
        );
      }

      throw error;
    }
  }

  /**
   * Read a Claim by id.
   *
   * **The transaction is optional here, and only here.** A read outside a
   * transaction is a read of committed state.
   *
   * @returns the Claim, or `null` when no Claim carries that id.
   */
  async findById(claimId: string, transaction?: TransactionHandle): Promise<PersistedClaim | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.claim.findUnique({
      where: { id: claimId },
      select: CLAIM_COLUMNS,
    });

    return found === null ? null : toPersistedClaim(found);
  }
}

/**
 * True when the error is a unique-constraint violation.
 *
 * **The code is checked, not the message.** Prisma's error codes are a
 * stable, documented part of its surface; the message is not.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * Map an inserted row back onto the domain shape.
 *
 * **The value objects are rebuilt through their own constructors**, not
 * hand-assembled — a hand-assembled `{ value }` is an unvalidated string
 * wearing a value object's clothes.
 *
 * **A row that carries no reason carries no reason.** A Claim written by a
 * lifecycle path — a withdrawal's auto-rejection, say — never went through
 * the submission form, so it has no reason and no identifying details. The
 * absence is carried through as an **explicit `null`**, because the
 * constructor *refuses* an empty string: rebuilding `''` as a value object
 * would either fail the read or fabricate a field the row does not have.
 *
 * **The date lost is read as a calendar day, not re-judged.** The row was
 * already validated on the way in, and the bound moves with the calendar — so
 * re-reading a Claim a year later must not fail on a date that was legal
 * when it was written. The read therefore reconstructs the **day** rather
 * than re-applying the 365-day rule to it.
 */
function toPersistedClaim(row: ClaimRow): PersistedClaim {
  return {
    id: row.id,
    reportId: row.reportId,
    claimantId: row.claimantId,
    status: row.status as PersistedClaim['status'],
    reason: row.reason === null ? null : createClaimReason(row.reason),
    identifyingDetails:
      row.identifyingDetails === null
        ? null
        : createClaimIdentifyingDetails(row.identifyingDetails),
    dateLost: toClaimDateLost(row.dateLost),
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Rebuild the Claim's date lost from a stored `DATE`.
 *
 * **The `DATE` column comes back at midnight UTC,** so the value is the day
 * itself and its ISO form is the day.
 */
function toClaimDateLost(date: Date | null): ClaimDateLost {
  if (date === null) {
    // A Claim written by a path that did not fill the field. The submission
    // path always fills it, and the database's CHECK constraint refuses a
    // `Pending` Claim that does not — so this is a decided Claim written by
    // some other path, and its date is genuinely absent.
    return { value: new Date(0), isoDay: '1970-01-01', kind: 'claimDateLost' };
  }

  return {
    value: date,
    isoDay: date.toISOString().slice(0, 10),
    kind: 'claimDateLost',
  };
}
