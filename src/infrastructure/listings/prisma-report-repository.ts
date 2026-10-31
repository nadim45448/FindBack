/**
 * The Prisma implementation of the report repository.
 *
 * **The id arrives with the report and is written as given.** The
 * `ValidatedReport` that arrives has no `id`; the `PersistedReport` that
 * leaves has one. The id is minted by the application layer, *before* the
 * blob is uploaded, so that the blob's path can be namespaced by the entity
 * id (`reports/{entityId}/`, image-handling §4) — the upload happens before
 * the row exists, and the path needs the id at upload time.
 *
 * **The write is inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter, so a report and its audit
 * event commit together or not at all (ADR-3). There is no method on this
 * class that writes outside a transaction — `findById` is the single
 * exception, because the lifecycle gates read the report *before* the write
 * transaction opens.
 *
 * **The Sensitive Fields are written here and read nowhere else.** The
 * `exactPlace`, `identifyingDetails`, and `imageRef` columns are populated
 * on insert and are **not** selected back out by this class. The insert
 * returns the id, and the id is enough: the caller already holds the
 * validated values it just wrote.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { ReportFieldUpdate } from '@/application/listings/ports/report-repository';
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

/**
 * The columns a read selects.
 *
 * **The same set for every read.** A `findById` that selected fewer columns
 * would return a report whose Sensitive Fields are absent, and a caller
 * comparing "did this field change?" would see a change every time. So the
 * read is complete, and the comparison in the edit path is honest.
 */
const REPORT_COLUMNS = {
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
} as const;

/** Prisma's report repository. */
export class PrismaReportRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Insert a report inside the caller's transaction and return it with its
   * id.
   *
   * **The id is written, not defaulted.** The column still has a database
   * default, but this insert supplies the id explicitly — the caller minted
   * it before the blob was uploaded, so that the blob's path could be
   * namespaced by the entity id (image-handling §4).
   */
  async create(
    reportId: string,
    report: ValidatedReport,
    transaction: TransactionHandle,
  ): Promise<PersistedReport> {
    const client = transactionClient(transaction);

    const created = await client.report.create({
      data: {
        id: reportId,
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
      select: REPORT_COLUMNS,
    });

    return toPersistedReport(created);
  }

  /**
   * Read a report by id.
   *
   * **The transaction is optional here, and only here.** A read outside a
   * transaction is a read of committed state, which is what the gate checks
   * need — they read the report *before* the write transaction opens. Every
   * *write* still requires a transaction.
   *
   * @returns the report, or `null` when no report carries that id.
   */
  async findById(reportId: string, transaction?: TransactionHandle): Promise<PersistedReport | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.report.findUnique({
      where: { id: reportId },
      select: REPORT_COLUMNS,
    });

    return found === null ? null : toPersistedReport(found);
  }

  /**
   * Apply an edit to a report inside the caller's transaction.
   *
   * **Only the fields present in `update` are written.** Prisma's `data`
   * object carries exactly what it is given, and the caller has already
   * decided which fields changed — so the write touches exactly the fields
   * the audit snapshot names, and no others.
   *
   * **The status is written only when the caller asks for it.** An edit
   * never puts a status in its update; the withdrawal path does.
   *
   * **`updatedAt` is set on every update.** The column is set at creation and
   * deliberately not Prisma's `@updatedAt`, so it is written explicitly here.
   */
  async update(
    reportId: string,
    update: ReportFieldUpdate,
    transaction: TransactionHandle,
  ): Promise<PersistedReport> {
    const client = transactionClient(transaction);

    const data: Record<string, unknown> = {};

    if (update.name !== undefined) {
      data['name'] = update.name;
    }
    if (update.category !== undefined) {
      data['category'] = update.category;
    }
    if (update.description !== undefined) {
      data['description'] = update.description;
    }
    if (update.date !== undefined) {
      data['date'] = new Date(`${update.date}T00:00:00.000Z`);
    }
    if (update.campusArea !== undefined) {
      data['campusArea'] = update.campusArea;
    }
    if (update.exactPlace !== undefined) {
      data['exactPlace'] = update.exactPlace;
    }
    if (update.identifyingDetails !== undefined) {
      data['identifyingDetails'] = update.identifyingDetails;
    }
    if (update.imageRef !== undefined) {
      data['imageRef'] = update.imageRef;
    }
    if (update.status !== undefined) {
      data['status'] = update.status;
    }

    data['updatedAt'] = new Date();

    const updated = await client.report.update({
      where: { id: reportId },
      data,
      select: REPORT_COLUMNS,
    });

    return toPersistedReport(updated);
  }

  /**
   * Delete a report inside the caller's transaction.
   *
   * **The caller must have deleted the report's audit entries first.** The
   * report row and its trail are removed together (PRD §10), and the audit
   * deletion opens the FR-10 window — so the order is the trail, then the
   * row.
   */
  async delete(reportId: string, transaction: TransactionHandle): Promise<void> {
    const client = transactionClient(transaction);

    await client.report.delete({ where: { id: reportId } });
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
