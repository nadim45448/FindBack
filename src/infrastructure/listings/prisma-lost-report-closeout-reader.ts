/**
 * The Prisma implementation of the Lost-report closeout reader.
 *
 * **The reader resolves the selected response in the query.** Which
 * response is "matched" is a fact about the report, read from the
 * database — never asserted by a client. A client that could name the
 * matched response would be choosing which response completes successfully
 * and which are merely resolved, which is exactly the thing the gate
 * exists to prevent.
 *
 * **Every response is read, not just the live ones.** The closeout decides
 * which responses are resolved *and* which are left alone, and the second
 * decision needs the terminal responses to be present — a response that was
 * already terminal is a fact the closeout records, not an absence.
 *
 * **The addresses travel with the rows.** The notifications fire after the
 * commit, and an address read at that later moment could belong to a
 * different response than the one the closeout completed.
 *
 * **The Sensitive Fields are not selected.** The reader needs the report's
 * type, status, name, owner, and the responses' ids, statuses, and
 * addresses — and nothing else. The exact place, the observed identifying
 * details, and the candidate image never enter this reader's result, so
 * they cannot reach an email body or an audit payload.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  CloseoutResponseRecord,
  LostCloseoutSubject,
  LostReportCloseoutReader,
} from '@/application/listings/ports/lost-report-closeout-reader';

import {
  isRecoveryResponseStatus,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

/** Prisma's Lost-report closeout reader. */
export class PrismaLostReportCloseoutReader implements LostReportCloseoutReader {
  constructor(private readonly client: PrismaClient) {}

  async readLostCloseoutSubject(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<LostCloseoutSubject | null> {
    const client = transaction
      ? (transaction.transaction as Prisma.TransactionClient)
      : this.client;

    // ── The report ─────────────────────────────────────────────────────────
    //
    // **The type is filtered in the query.** The reader reads Lost reports
    // for a closeout, and a Found report never reaches the application
    // layer — so the closeout's Lost-only rules cannot be applied to it by
    // accident.
    const report = await client.report.findFirst({
      where: { id: reportId, type: 'Lost' },
      select: {
        id: true,
        status: true,
        name: true,
        reporterId: true,
        reporter: { select: { email: true } },
        recoveryResponses: {
          select: {
            id: true,
            status: true,
            responder: { select: { email: true } },
          },
        },
      },
    });

    if (report === null) {
      return null;
    }

    // ── The responses ──────────────────────────────────────────────────────
    //
    // **A status the vocabulary does not name is refused, not coerced.** The
    // database's `CHECK` constraint already rejects such a write, so a
    // value that is not canonical means the row was written by something
    // that did not go through the constraint — and treating it as a nearby
    // status would invent a fact.
    const responses: CloseoutResponseRecord[] = report.recoveryResponses.map(
      (response) => {
        if (!isRecoveryResponseStatus(response.status)) {
          throw new Error(
            `"${response.status}" is not a Recovery Response status.`,
          );
        }

        return {
          id: response.id,
          status: response.status as RecoveryResponseStatus,
          responderEmail: response.responder.email,
        };
      },
    );

    // ── The selected response ──────────────────────────────────────────────
    //
    // **The selection is read from the responses themselves.** The owner
    // selects a response for verification by moving it to `Selected for
    // Verification`, so the selected response is the one holding that
    // status — and after a `Match Confirmed` determination it is the one
    // that holds `Match Confirmed`.
    const selected =
      responses.find((response) => response.status === 'Selected for Verification') ??
      responses.find((response) => response.status === 'Match Confirmed');

    return {
      id: report.id,
      status: report.status,
      name: report.name,
      ownerId: report.reporterId,
      ownerEmail: report.reporter.email,
      responses,
      selectedResponseId: selected?.id ?? null,
    };
  }
}
