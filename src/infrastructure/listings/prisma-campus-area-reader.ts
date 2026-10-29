/**
 * The Prisma implementation of the campus-area reader.
 *
 * **The `campus_areas` table** (ADR-20). The reader returns only the
 * **active** areas — the ones that accept new submissions. A deactivated
 * area keeps its row and every report that names it; it simply stops
 * accepting new reports.
 *
 * **A read failure is a refusal.** The error is translated into
 * `CampusAreaUnavailableError` rather than being allowed to escape as a
 * raw driver error, so the application layer can distinguish "the list is
 * unavailable" from "the list is empty" — the first is a transient outage,
 * the second is a deployment that has not been configured.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CampusAreaUnavailableError,
  type CampusAreaReader,
} from '@/application/listings/ports/campus-area-reader';
import type { CampusArea } from '@/domain/listings';

/** Prisma's campus-area reader. */
export class PrismaCampusAreaReader implements CampusAreaReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * The areas that accept new submissions.
   *
   * @throws {CampusAreaUnavailableError} when the list cannot be read. The
   * caller refuses; it does not proceed with an assumed set.
   */
  async listActive(): Promise<readonly CampusArea[]> {
    try {
      const rows = await this.client.campusArea.findMany({
        where: { active: true },
        select: { value: true, label: true, active: true },
        orderBy: { value: 'asc' },
      });

      return rows.map((row) => ({
        value: row.value,
        label: row.label,
        active: row.active,
      }));
    } catch (error) {
      // A Prisma error is an infrastructure failure; the domain must not
      // see it as "no areas configured".
      throw new CampusAreaUnavailableError(
        `The campus area list could not be read: ${
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.message
            : 'the database did not respond'
        }`,
      );
    }
  }
}
