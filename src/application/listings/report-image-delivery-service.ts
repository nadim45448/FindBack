/**
 * The report image delivery service — the use case that hands a member the
 * image's bytes.
 *
 * **The sequence is fixed, and the order is the mechanism:**
 *
 * 1. **Resolve the viewer** from the `ActorContext`.
 * 2. **Refuse an anonymous viewer.** Before anything is loaded, and with the
 *    same refusal a missing image receives — a viewer who may not have the
 *    image must not learn whether the report has one.
 * 3. **Load the image and the relationship** together.
 * 4. **Resolve the FR-39 columns** from the viewer and the relationship.
 * 5. **Apply the per-image delivery rule.** The columns say what a position
 *    grants; the per-image rule says who may receive the *bytes*, and it is
 *    narrower than the field grant.
 * 6. **Only then read the blob.**
 *
 * **Step 6 is why the order matters.** The authorisation is evaluated in
 * this method, immediately adjacent to the read, and never delegated to the
 * CDN, to middleware, or to a cache. image-handling §2 states it directly:
 * "a cached private response served to the wrong viewer is a data leak", and
 * ADR-2 forbids relying on the CDN or middleware for this check.
 *
 * **A refusal is a `NotFoundError`, not a 403.** The image's existence is
 * itself information a refused viewer must not have, so every refusal —
 * anonymous, unrelated member, claimant, recovery responder, and a report
 * with no image — produces the same answer.
 */

import { NotFoundError } from '@/lib/errors';
import type { ActorContext } from '@/domain/accounts/actor-context';
import {
  isServableImageContentType,
  mayReceiveImage,
  resolveColumns,
  viewerFromActorContext,
  type ProjectionColumn,
  type Viewer,
} from '@/domain/listings';
import type { ImageReader, RetrievedImage } from './ports/image-reader';
import type { ReportImageReader } from './ports/report-image-reader';

/** The collaborators the service sequences. */
export interface ReportImageDeliveryDependencies {
  /** Loads a report's image and the viewer's relationship to it. */
  readonly reportImages: ReportImageReader;
  /** Reads the image's bytes. */
  readonly images: ImageReader;
}

/** The delivered image, ready for the route to stream. */
export interface DeliveredImage {
  readonly bytes: Buffer;
  /** The server-set content type, from the allowlist. */
  readonly contentType: string;
}

export class ReportImageDeliveryService {
  constructor(private readonly dependencies: ReportImageDeliveryDependencies) {}

  /**
   * Deliver a report's image to an actor.
   *
   * @throws {NotFoundError} when the viewer may not have the image, when the
   * report has no image, or when the report does not exist. The three are
   * deliberately indistinguishable.
   */
  async deliver(actor: ActorContext | null, reportId: string): Promise<DeliveredImage> {
    const viewer = viewerFromActorContext(actor);

    // **The refusal is issued before anything is loaded.** An anonymous
    // viewer is refused the image, and the refusal says nothing about
    // whether the report or its image exists.
    if (viewer.kind === 'anonymous') {
      throw new NotFoundError('That image could not be found.');
    }

    const loaded = await this.dependencies.reportImages.loadImageForViewer(
      reportId,
      viewer.accountId!,
    );

    if (!loaded) {
      throw new NotFoundError('That image could not be found.');
    }

    const columns = resolveColumns(viewer, loaded.relationship);

    // **The per-image rule, immediately before the read.** The columns
    // grant the `image` *field* to a claimant and to a recovery responder;
    // the delivery rule refuses them the *bytes*.
    if (!mayReceiveImage(viewer, loaded.relationship, columns)) {
      throw new NotFoundError('That image could not be found.');
    }

    const image = await this.dependencies.images.read(loaded.image.path);

    return this.present(image);
  }

  /**
   * The response's content type.
   *
   * **From the allowlist, looked up on the way out.** The reader derives
   * the type from the image's own bytes, and the allowlist is the last
   * gate before those bytes reach a browser. The type is never the
   * upload's declared type, never a stored column, and never the blob
   * store's metadata.
   *
   * **A type outside the allowlist is a not-found, not a validation
   * error.** It would mean an image was stored without passing validation
   * — a defect in how it was stored, not a mistake by the viewer. A 400
   * would tell the viewer their request was wrong, which it was not; and a
   * 500 would tell them the server is broken, which would be true but
   * would also disclose that *something* is stored here. The not-found says
   * only what every other refusal says: there is no image this viewer may
   * have.
   */
  private present(image: RetrievedImage): DeliveredImage {
    if (!isServableImageContentType(image.contentType)) {
      throw new NotFoundError('That image could not be found.');
    }

    return { bytes: image.bytes, contentType: image.contentType };
  }
}

/**
 * The columns a viewer holds on a report.
 *
 * Exported so that a caller which has already resolved them — a caller
 * assembling several projections for one request — does not resolve them
 * twice. The resolution is a pure function, so resolving it twice gives the
 * same answer; this is a convenience, not a correctness requirement.
 */
export { resolveColumns, type ProjectionColumn, type Viewer };
