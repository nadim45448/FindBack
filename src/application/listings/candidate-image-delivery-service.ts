/**
 * The candidate image delivery service — the use case that hands a member the
 * bytes of a Recovery Response's candidate image.
 *
 * **The sequence is fixed, and the order is the mechanism:**
 *
 * 1. **Resolve the viewer** from the `ActorContext`.
 * 2. **Refuse an anonymous viewer.** Before anything is loaded, and with the
 *    same refusal a missing image receives — a viewer who may not have the
 *    image must not learn whether the Response has one.
 * 3. **Load the image and the relationship** together.
 * 4. **Resolve the FR-39 columns** from the viewer and the report
 *    relationship.
 * 5. **Apply the per-image delivery rule.** The columns say what a position
 *    grants; the per-image rule says who may receive the *bytes*.
 * 6. **Only then read the blob.**
 *
 * **Step 6 is why the order matters.** The authorisation is evaluated in
 * this method, immediately adjacent to the read, and never delegated to the
 * CDN, to middleware, or to a cache. `image-handling.md` §2 states it
 * directly: "a cached private response served to the wrong viewer is a data
 * leak", and ADR-2 forbids relying on the CDN or middleware for this check.
 *
 * **A refusal is a `NotFoundError`, not a 403.** The image's existence is
 * itself information a refused viewer must not have, so every refusal —
 * anonymous, unrelated member, competing responder, claimant, and a
 * Response with no image — produces the same answer.
 *
 * **This is the Lost-side sibling of `ReportImageDeliveryService`, and it
 * does not share a line with it.** The two images have different entities
 * and different viewers; a shared implementation would have to be
 * parameterised by an entity kind, and a parameterised authorisation is one
 * whose two branches can drift apart. The *rule* is shared, in the domain
 * (`candidate-image-delivery.ts`); the *sequencing* is not.
 */

import { NotFoundError } from '@/lib/errors';
import type { ActorContext } from '@/domain/accounts/actor-context';
import {
  createReportRelationship,
  isServableImageContentType,
  resolveColumns,
  viewerFromActorContext,
} from '@/domain/listings';
import { mayReceiveCandidateImage } from '@/domain/recovery';
import type { ImageReader, RetrievedImage } from './ports/image-reader';
import type { CandidateImageReader } from './ports/candidate-image-reader';

/** The collaborators the service sequences. */
export interface CandidateImageDeliveryDependencies {
  /** Loads a Response's candidate image and the viewer's relationship to it. */
  readonly candidateImages: CandidateImageReader;
  /** Reads the image's bytes. */
  readonly images: ImageReader;
}

/** The delivered image, ready for the route to stream. */
export interface DeliveredImage {
  readonly bytes: Buffer;
  /** The server-set content type, from the allowlist. */
  readonly contentType: string;
}

export class CandidateImageDeliveryService {
  constructor(private readonly dependencies: CandidateImageDeliveryDependencies) {}

  /**
   * Deliver a Recovery Response's candidate image to an actor.
   *
   * @throws {NotFoundError} when the viewer may not have the image, when the
   * Response has no image, or when the Response does not exist. The three are
   * deliberately indistinguishable.
   */
  async deliver(actor: ActorContext | null, responseId: string): Promise<DeliveredImage> {
    const viewer = viewerFromActorContext(actor);

    // **The refusal is issued before anything is loaded.** An anonymous
    // viewer is refused the image, and the refusal says nothing about
    // whether the Response or its image exists.
    if (viewer.kind === 'anonymous') {
      throw new NotFoundError('That image could not be found.');
    }

    const loaded = await this.dependencies.candidateImages.loadCandidateImageForViewer(
      responseId,
      viewer.accountId!,
    );

    if (!loaded) {
      throw new NotFoundError('That image could not be found.');
    }

    // **The columns are resolved for the report the Response belongs to.**
    // The report's relationship is rebuilt from the facts the reader
    // returned — through `createReportRelationship`, so `isReporter` is
    // computed by equality and never supplied — which means the owner
    // column is only held by the report's actual author.
    const columns = resolveColumns(
      viewer,
      createReportRelationship({
        reportId: loaded.relationship.reportId,
        reportType: 'Lost',
        reporterId: loaded.relationship.reportOwnerId,
        viewerId: loaded.relationship.viewerId,
      }),
    );

    // **The per-image rule, immediately before the read.** A recovery
    // responder's column grants the *field*; the delivery rule refuses them
    // any candidate image but their own.
    if (!mayReceiveCandidateImage(viewer, loaded.relationship, columns)) {
      throw new NotFoundError('That image could not be found.');
    }

    const image = await this.dependencies.images.read(loaded.image.path);

    return this.present(image);
  }

  /**
   * The response's content type.
   *
   * **From the allowlist, looked up on the way out.** The reader derives the
   * type from the image's own bytes, and the allowlist is the last gate
   * before those bytes reach a browser. The type is never the upload's
   * declared type, never a stored column, and never the blob store's
   * metadata.
   *
   * **A type outside the allowlist is a not-found, not a validation
   * error.** It would mean an image was stored without passing validation —
   * a defect in how it was stored, not a mistake by the viewer.
   */
  private present(image: RetrievedImage): DeliveredImage {
    if (!isServableImageContentType(image.contentType)) {
      throw new NotFoundError('That image could not be found.');
    }

    return { bytes: image.bytes, contentType: image.contentType };
  }
}
