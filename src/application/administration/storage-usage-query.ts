/**
 * The administrator's storage-usage query — image-handling §4.
 *
 * ## Why this is a use case and not a page helper
 *
 * The budget is **enforced** on the write path, in
 * `ReportCreationService` and `ReportAdministratorEditService`, where a
 * refusal has to happen before the bytes are written. But the **warnings** —
 * the 70% and 90% bands — have to reach an administrator, and a warning
 * that lives inside a write path is a warning nobody ever sees.
 *
 * So the budget is read from a second place: here, on a page an
 * administrator can open. **The two reads cannot disagree about the
 * thresholds**, because both go through the domain's `classifyQuota` — the
 * write path's refusal and this page's warning are the same arithmetic.
 *
 * ## The authorisation is here, before anything is read
 *
 * The storage budget is **not** a member's business. A non-administrator
 * reaches no reader, learns nothing about how full the budget is, and
 * receives no signal that a read was even attempted. The check is the
 * application layer's, exactly as the dashboard's is — and the page's own
 * access screen is the second gate.
 *
 * ## A failed read is not a failure of the page
 *
 * The blob store may be unreachable. That is not the administrator's
 * problem to solve, and a 500 tells them nothing actionable — so the
 * failure is **reported as a fact** (`error`) and the page renders its calm
 * error state. The one thing the page must never do is show a *number* it
 * could not read.
 *
 * Pure orchestration — the port does the I/O.
 */

import { PermissionDeniedError } from '@/lib/errors';

import {
  buildStorageUsageView,
  type StorageUsageView,
} from '@/domain/administration';

import type { ImageQuotaReader } from '@/application/listings/ports/image-quota-reader';

/**
 * Who is asking for the storage usage.
 */
export interface StorageUsageViewer {
  readonly userId: string;
  readonly isAdministrator: boolean;
}

/**
 * The result of reading the storage budget.
 *
 * **The usage is `null` when the read failed**, and the error says so. The
 * page must never show a number it did not read, and it must never show
 * `0 bytes used` for a read that failed — zero is a fact about the budget,
 * and a failed read is not a fact.
 */
export interface StorageUsageResult {
  readonly usage: StorageUsageView | null;
  readonly error?: string | undefined;
}

/**
 * The message the page shows when the budget cannot be read.
 */
export const STORAGE_USAGE_READ_FAILED =
  'The image storage usage could not be read right now.';

/**
 * Reads the administrator's view of the blob storage budget.
 */
export class StorageUsageQuery {
  constructor(private readonly quota: ImageQuotaReader) {}

  /**
   * Read the storage budget.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   */
  async read(viewer: StorageUsageViewer): Promise<StorageUsageResult> {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read the storage usage.');
    }

    try {
      const state = await this.quota.readUsage();

      return { usage: buildStorageUsageView(state) };
    } catch {
      // **A failed read is a fact about the read, not about the budget.**
      // The page shows its error state; it never shows a number it did not
      // read.
      return { usage: null, error: STORAGE_USAGE_READ_FAILED };
    }
  }
}
