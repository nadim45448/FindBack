/**
 * The candidate image reader port.
 *
 * **The image's reference is loaded together with the relationship.** The
 * delivery rule needs four facts — the Response's responder, the report's
 * owner, the viewer's relationship to *this* Response, and the image's path
 * — and they are read together so that the authorisation decision is made
 * from one consistent snapshot. A reader that loaded the path and the
 * relationship separately could, in principle, decide on one and read the
 * other.
 *
 * **The path is not the whole answer.** A Response with no image has no
 * path, and a viewer who may not have the image must not be able to learn
 * whether one exists — so the reader returns `null` for a Response with no
 * image, and the service turns that into the same refusal a viewer without
 * permission receives.
 *
 * **There is no stored content type, and that is deliberate.** The Response
 * row carries the blob *path* and nothing else. So the served type is
 * derived from the image's **bytes** when they are read, never from a stored
 * column and never from the blob store's metadata. There is nothing for a
 * client to have influenced.
 */

import type { CandidateImageRelationship } from '@/domain/recovery';

/** A Response's candidate image. */
export interface CandidateImageReference {
  /** The blob path. Never a URL. */
  readonly path: string;
}

/**
 * A Response's candidate image and the relationship facts that authorise
 * reading it.
 */
export interface LoadedCandidateImage {
  readonly image: CandidateImageReference;
  readonly relationship: CandidateImageRelationship;
}

/** Reads a Recovery Response's stored candidate image. */
export interface CandidateImageReader {
  /**
   * Load a Response's candidate image and the viewer's relationship to it.
   *
   * Returns `null` when the Response does not exist, when it has no image, or
   * when the viewer is not a member — the three are deliberately
   * indistinguishable, because a viewer who may not have the image must not
   * learn whether the Response has one.
   */
  loadCandidateImageForViewer(
    responseId: string,
    viewerId: string,
  ): Promise<LoadedCandidateImage | null>;
}
