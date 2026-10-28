/**
 * The thread visibility reader port.
 *
 * **The reader cannot widen its scope.** It loads threads only for the
 * parents it is handed — the already-scoped Claims and Responses the viewer
 * may see. A thread's visibility is exactly its parent's visibility, so a
 * thread is never granted on its own.
 *
 * This is also where "participation grants no private evidence" is kept
 * honest: the reader returns **messages**, and the messages carry no Claim
 * reason, no Claim identifying details, and no Recovery Response sensitive
 * fields. Those are in the parent records, which the projection grants
 * separately.
 */

import type { ProjectionColumn, ThreadMessageRow } from '@/domain/listings';

/** Reads thread messages for a column set. */
export interface ThreadVisibilityReader {
  /**
   * Load the thread messages for a set of already-scoped parents.
   *
   * `claimIds` and `responseIds` are the visible parent ids. An empty pair
   * means the viewer may see **no** threads.
   */
  loadThreadsForViewer(
    claimIds: readonly string[],
    responseIds: readonly string[],
    columns: readonly ProjectionColumn[],
  ): Promise<readonly ThreadMessageRow[]>;
}
