/**
 * The Prisma implementation of the Recovery Response repository.
 *
 * **The id is minted by the database, once.** The `ValidatedRecoveryResponse`
 * that arrives has no `id`; the `PersistedRecoveryResponse` that leaves has
 * one. The repository does not invent an id — the column's default does, so
 * the id cannot be supplied by a caller.
 *
 * **The write is inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter, so the Response and its audit
 * event commit together or not at all (ADR-3).
 *
 * **The uniqueness violation is translated.** The
 * `uq_recovery_responses_one_live_per_report_per_responder` index refuses a
 * second **non-terminal** Response from the same responder on the same
 * report, and PostgreSQL raises it as a generic driver error. The
 * repository turns that into a `DuplicateLiveRecoveryResponseError`, so the
 * application layer's refusal carries the responder's own message rather than
 * a Prisma error code — and so the **untranslated** case (the constraint
 * firing where the application check did not) is still a *business* outcome
 * and not a 500.
 *
 * **The Sensitive Fields are written here and read back through their own
 * constructors.** The `where_found_exact_place` and
 * `observed_identifying_details` columns are populated on insert; a row read
 * back is rebuilt through `createRecoveryResponseWhereFound` and
 * `createRecoveryResponseObservedDetails`, so a row holding an out-of-bounds
 * value is **refused** rather than carried into the domain unchecked.
 *
 * **A `null` column is an absence, not an out-of-bounds value.** A Response
 * written by a lifecycle path — a report's closure resolving its open
 * responses — was never submitted, so it carries none of the submission
 * fields. Those columns are nullable for exactly that reason, and the read
 * says "absent" rather than fabricating an empty value or failing on one.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import { DuplicateLiveRecoveryResponseError } from '@/application/listings/ports/recovery-response-repository';
import type {
  PersistedRecoveryResponse,
  ValidatedRecoveryResponse,
} from '@/domain/recovery';
import {
  createRecoveryResponseObservedDetails,
  createRecoveryResponseWhereFound,
} from '@/domain/recovery';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A Response written outside the
 * caller's transaction could commit without its audit event — and the audit
 * trail is append-only with no correction path (ADR-6), so that error would
 * be permanent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('recoveryResponse' in candidate)) {
    throw new Error(
      'A recovery response must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The row shape the reads select. */
interface RecoveryResponseRow {
  id: string;
  reportId: string;
  responderId: string;
  status: string;
  campusArea: string | null;
  whereFoundExactPlace: string | null;
  observedIdentifyingDetails: string | null;
  dateFound: Date | null;
  candidateImageRef: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The columns a read selects. */
const RECOVERY_RESPONSE_COLUMNS = {
  id: true,
  reportId: true,
  responderId: true,
  status: true,
  campusArea: true,
  whereFoundExactPlace: true,
  observedIdentifyingDetails: true,
  dateFound: true,
  candidateImageRef: true,
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

/** Prisma's Recovery Response repository. */
export class PrismaRecoveryResponseRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Insert a Recovery Response inside the caller's transaction and return it
   * with its minted id.
   *
   * @throws {DuplicateLiveRecoveryResponseError} when the uniqueness
   * constraint refuses a second non-terminal Response from this responder on
   * this report.
   */
  async create(
    response: ValidatedRecoveryResponse,
    transaction: TransactionHandle,
  ): Promise<PersistedRecoveryResponse> {
    const client = transactionClient(transaction);

    try {
      const created = await client.recoveryResponse.create({
        data: {
          reportId: response.reportId,
          responderId: response.responderId,
          status: response.status,
          // **The campus area is stored as plain text**, exactly as
          // `reports.campus_area` is — the deployment's set is a *validation*
          // rule, not a referential one (ADR-20).
          campusArea: response.campusArea.value,
          whereFoundExactPlace: response.whereFoundExactPlace.value,
          observedIdentifyingDetails: response.observedIdentifyingDetails.value,
          dateFound: response.dateFound.value,
          candidateImageRef: response.candidateImageRef,
          submittedAt: response.submittedAt,
          createdAt: response.createdAt,
          updatedAt: response.updatedAt,
        },
        select: RECOVERY_RESPONSE_COLUMNS,
      });

      return toPersistedRecoveryResponse(created, created.campusArea);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateLiveRecoveryResponseError(
          'You already have an open response on this lost item.',
        );
      }

      throw error;
    }
  }

  /**
   * Read a Recovery Response by id.
   *
   * **The transaction is optional here, and only here.** A read outside a
   * transaction is a read of committed state.
   *
   * @returns the Response, or `null` when no Response carries that id.
   */
  async findById(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<PersistedRecoveryResponse | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.recoveryResponse.findUnique({
      where: { id: responseId },
      select: RECOVERY_RESPONSE_COLUMNS,
    });

    return found === null ? null : toPersistedRecoveryResponse(found, found.campusArea);
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
 * **A `null` column is an absence, not an out-of-bounds value.** A Response
 * written by a lifecycle path — a report's closure resolving its open
 * responses — was never submitted, so it carries none of the submission
 * fields. Those columns are nullable for exactly that reason, and the read
 * must be able to say "absent" rather than fabricate an empty value or fail
 * on one. A row that carries a *present* value is still rebuilt through its
 * constructor, so an out-of-bounds value is **refused** on the way out
 * rather than carried into the domain unchecked.
 *
 * **The date found is read as a calendar day, not re-judged.** The row was
 * already validated on the way in, and the bound moves with the calendar — so
 * re-reading a Response a month later must not fail on a date that was legal
 * when it was written.
 */
function toPersistedRecoveryResponse(
  row: RecoveryResponseRow,
  campusArea: string | null,
): PersistedRecoveryResponse {
  return {
    id: row.id,
    reportId: row.reportId,
    responderId: row.responderId,
    status: row.status as PersistedRecoveryResponse['status'],
    campusArea:
      // **The campus area is plain text on the way out.** The deployment's
      // set is a *validation* rule, not a referential one (ADR-20), and the
      // stored value has no foreign key — so a read must not refuse an area
      // the deployment has since retired.
      campusArea === null ? null : { value: campusArea },
    whereFoundExactPlace:
      row.whereFoundExactPlace === null
        ? null
        : createRecoveryResponseWhereFound(row.whereFoundExactPlace),
    observedIdentifyingDetails:
      row.observedIdentifyingDetails === null
        ? null
        : createRecoveryResponseObservedDetails(row.observedIdentifyingDetails),
    dateFound:
      row.dateFound === null
        ? null
        : {
            value: row.dateFound,
            isoDay: row.dateFound.toISOString().slice(0, 10),
            kind: 'recoveryResponseDateFound' as const,
          },
    candidateImageRef: row.candidateImageRef,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
