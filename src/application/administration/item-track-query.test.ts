import { describe, expect, it } from 'vitest';

import { PermissionDeniedError } from '@/lib/errors';

import { ItemTrackQuery } from './item-track-query';
import type { ItemTrackReader } from './ports/item-track-reader';

describe('ItemTrackQuery', () => {
  const reader: ItemTrackReader = {
    listReturned: async () => [],
    readTrack: async () => null,
  };

  it('refuses a non-administrator', async () => {
    const query = new ItemTrackQuery(reader);

    await expect(
      query.listReturned({ userId: 'u1', isAdministrator: false }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
