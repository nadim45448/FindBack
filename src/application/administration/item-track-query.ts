/**
 * Administrator item tracking — returned list and per-report case files.
 */

import { PermissionDeniedError } from '@/lib/errors';

import type {
  ItemTrackReader,
  ItemTrackReading,
  ReturnedItemRow,
} from './ports/item-track-reader';

export const RETURNED_ITEMS_PAGE_SIZE = 50;

export interface TrackViewer {
  readonly userId: string;
  readonly isAdministrator: boolean;
}

export class ItemTrackQuery {
  constructor(private readonly reader: ItemTrackReader) {}

  async listReturned(viewer: TrackViewer): Promise<readonly ReturnedItemRow[]> {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read handoff records.');
    }

    return this.reader.listReturned(RETURNED_ITEMS_PAGE_SIZE);
  }

  async readTrack(viewer: TrackViewer, reportId: string): Promise<ItemTrackReading | null> {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read handoff records.');
    }

    return this.reader.readTrack(reportId);
  }
}
