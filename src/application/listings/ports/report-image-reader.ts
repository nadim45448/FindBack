/**
 * The report image reader port.
 *
 * **The image's reference is loaded together with the relationship.** The
 * delivery rule needs three facts — the report's author, the viewer's
 * relationship to it, and the image's path — and they are read together so
 * that the authorisation decision is made from one consistent snapshot. A
 * reader that loaded the path and the relationship separately could, in
 * principle, decide on one and read the other.
 *
 * **The path is not the whole answer.** A report with no image has no path,
 * and a viewer who may not have the image must not be able to learn whether
 * one exists — so the reader returns `null` for a report with no image, and
 * the service turns that into the same refusal a viewer without permission
 * receives.
 *
 * **There is no stored content type, and that is deliberate.** The report
 * row carries the blob *path* and nothing else — the schema's field set is
 * closed, and `image_ref` is one column. So the served type is derived from
 * the image's **bytes** when they are read, never from a stored column and
 * never from the blob store's metadata. There is nothing for a client to
 * have influenced.
 */

import type { ReportRelationship } from '@/domain/listings';

/** A report's image, and the relationship facts that authorise reading it. */
export interface ReportImageReference {
  /** The blob path. Never a URL. */
  readonly path: string;
}

/** Reads a report's stored image. */
export interface ReportImageReader {
  /**
   * Load a report's image and the viewer's relationship to the report.
   *
   * Returns `null` when the report does not exist, when it has no image, or
   * when the viewer is not a member — the three are deliberately
   * indistinguishable, because a viewer who may not have the image must not
   * learn whether the report has one.
   */
  loadImageForViewer(
    reportId: string,
    viewerId: string,
  ): Promise<{ readonly image: ReportImageReference; readonly relationship: ReportRelationship } | null>;
}
