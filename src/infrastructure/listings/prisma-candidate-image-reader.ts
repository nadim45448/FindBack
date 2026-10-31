/**
 * The Prisma implementation of the candidate image reader.
 *
 * **One query, one snapshot.** The image's path and the viewer's
 * relationship to the Response are read together, so the authorisation
 * decision is made against a consistent view of both. A reader that loaded
 * the path and the relationship separately could in principle decide on one
 * and read the other — and the gap between two reads is where a Response
 * that was withdrawn, or a report that was closed, becomes a leak.
 *
 * **The `candidate_image_ref` column is selected only when it is not null —
 * which is the reader's own answer.** A Response with no image produces no
 * row here, and the service turns that into the same refusal a viewer
 * without permission receives. A viewer who may not have the image must not
 * be able to learn whether the Response has one.
 *
 * **The responder's identity comes from the row, not from the URL.** The
 * Response's `responder_id` is what decides whether the viewer is the
 * responder who submitted *this* Response. A competing responder on the
 * same report holds the same FR-39 column and is still refused — so the
 * decision needs the row, and the row is the only place that has it.
 *
 * **The report's owner comes from the joined report.** The Lost-report
 * owner's grant depends on authorship of the report the Response was made
 * against, and that fact lives on the report row.
 *
 * **No content type is read, because none is stored.** The Response row
 * carries the blob *path* and nothing else. The served type is derived from
 * the image's bytes when they are read.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  CandidateImageReader,
  LoadedCandidateImage,
} from '@/application/listings/ports/candidate-image-reader';
import { PHYSICAL, TABLES, quoteName } from './physical-columns';

/** The row shape the candidate image query returns. */
interface CandidateImageQueryRow {
  response_id: string;
  report_id: string;
  responder_id: string;
  candidate_image_ref: string | null;
  report_owner_id: string;
}

/** The Prisma candidate image reader. */
export class PrismaCandidateImageReader implements CandidateImageReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Load a Response's candidate image and the viewer's relationship to it.
   *
   * Returns `null` when the Response does not exist, when it has no image, or
   * when the viewer is not a member — the three are deliberately
   * indistinguishable.
   */
  async loadCandidateImageForViewer(
    responseId: string,
    viewerId: string,
  ): Promise<LoadedCandidateImage | null> {
    const rows = await this.client.$queryRaw<CandidateImageQueryRow[]>(
      Prisma.sql`
        SELECT
          rr.${Prisma.raw(quoteName(PHYSICAL.response.id))}                    AS response_id,
          rr.${Prisma.raw(quoteName(PHYSICAL.response.reportId))}              AS report_id,
          rr.${Prisma.raw(quoteName(PHYSICAL.response.responderId))}          AS responder_id,
          rr.${Prisma.raw(quoteName(PHYSICAL.response.candidateImageRef))}    AS candidate_image_ref,
          r.${Prisma.raw(quoteName(PHYSICAL.report.reporterId))}              AS report_owner_id
        FROM ${Prisma.raw(quoteName(TABLES.response))} rr
        INNER JOIN ${Prisma.raw(quoteName(TABLES.report))} r
          ON r.${Prisma.raw(quoteName(PHYSICAL.report.id))} = rr.${Prisma.raw(quoteName(PHYSICAL.response.reportId))}
        WHERE rr.${Prisma.raw(quoteName(PHYSICAL.response.id))} = ${responseId}
          AND rr.${Prisma.raw(quoteName(PHYSICAL.response.candidateImageRef))} IS NOT NULL
        LIMIT 1
      `,
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      image: { path: row.candidate_image_ref! },
      relationship: {
        responseId: row.response_id,
        reportId: row.report_id,
        responderId: row.responder_id,
        reportOwnerId: row.report_owner_id,
        viewerId,
        // **The equality, computed here.** The viewer's own Response is the
        // one whose `responder_id` is the viewer — not any other Response on
        // the same report.
        isResponder: row.responder_id === viewerId,
      },
    };
  }
}
