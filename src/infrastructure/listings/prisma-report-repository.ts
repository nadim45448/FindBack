/**
 * The Prisma implementation of the report repository.
 *
 * **The id is minted here, once.** The repository is the only thing that
 * knows how a report's id is produced, and it produces it inside the
 * `INSERT` — so a caller cannot supply one, and the domain cannot invent
 * one. The `ValidatedReport` that arrives has no `id`; the
 * `PersistedReport` that leaves has one.
 *
 * **The write is inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter, so a report and its audit
 * event commit together or not at all (ADR-3). There is no method on this
 * class that writes outside a transaction, and no method that updates or
 * deletes — the report's lifecycle belongs to the bolts that own it.
 *
 * **The Sensitive Fields are written here and read nowhere else.** The
 * `exactPlace`, `identifyingDetails`, and `imageRef` columns are populated
 * on insert and are **not** selected back out by this class. The insert
 * returns the id, and the id is enough: the caller already holds the
 * validated values it just wrote.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { PersistedReport, ValidatedReport } from '@/domain/listings';
import {
  createExactPlace,
  createIdentifyingDetails,
  createImageRef,
  createReportDescription,
  createReportName,
  parseReportDate,
} from '@/domain/listings';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A report written outside the
 * caller's transaction could commit without its audit event — and the audit
 * trail is append-only with no correction path (ADR-6), so that error would
 * be permanent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('report' in candidate)) {
    throw new Error(
      'A report must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The row shape the insert returns. */
interface ReportRow {
  id: string;
  type: string;
  status: string;
  name: string;
  category: string;
  description: string;
  date: Date;
  campusArea: string;
  exactPlace: string | null;
  identifyingDetails: string | null;
  imageRef: string | null;
  reporterId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Prisma's report repository. */
export class PrismaReportRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Insert a report inside the caller's transaction and return it with its
   * minted id.
   */
  async create(
    report: ValidatedReport,
    transaction: TransactionHandle,
  ): Promise<PersistedReport> {
    const client = transactionClient(transaction);

    const created = await client.report.create({
      data: {
        type: report.type,
        status: report.status,
        name: report.name.value,
        category: report.category,
        description: report.description.value,
        date: report.date.value,
        campusArea: report.campusArea.value,
        exactPlace: report.exactPlace?.value ?? null,
        identifyingDetails: report.identifyingDetails?.value ?? null,
        imageRef: report.imageRef?.path ?? null,
        reporterId: report.reporterId,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      },
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        category: true,
        description: true,
        date: true,
        campusArea: true,
        exactPlace: true,
        identifyingDetails: true,
        imageRef: true,
        reporterId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return toPersistedReport(created);
  }
}

/**
 * Map an inserted row back onto the domain shape.
 *
 * **The value objects are rebuilt through their own constructors**, not
 * hand-assembled. That is deliberate: a value object carries its brand, and
 * a hand-assembled `{ value }` is not a value object at all — it is an
 * unvalidated string wearing one. Rebuilding also means a row that somehow
 * holds an out-of-bounds value is **refused** rather than carried into the
 * domain unchecked.
 *
 * The `date` is read as a **calendar day** — the column is a `DATE`, so
 * PostgreSQL returns it at midnight UTC and the value is the day itself.
 */
function toPersistedReport(row: ReportRow): PersistedReport {
  return {
    id: row.id,
    type: row.type as PersistedReport['type'],
    status: row.status as PersistedReport['status'],
    name: createReportName(row.name),
    category: row.category as PersistedReport['category'],
    description: createReportDescription(row.description),
    date: parseReportDate(row.date.toISOString().slice(0, 10)),
    campusArea: { value: row.campusArea },
    exactPlace: createExactPlace(row.exactPlace),
    identifyingDetails: createIdentifyingDetails(row.identifyingDetails),
    imageRef: row.imageRef === null ? null : createImageRef(row.imageRef),
    reporterId: row.reporterId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
