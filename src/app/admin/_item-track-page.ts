import type { ItemTrackReading } from '@/application/administration/ports/item-track-reader';

import { buildAdminStack } from './_admin-page';

export async function readReturnedItems(userId: string) {
  const stack = buildAdminStack();

  return stack.track.listReturned({ userId, isAdministrator: true });
}

export async function readItemTrack(
  userId: string,
  reportId: string,
): Promise<ItemTrackReading | null> {
  const stack = buildAdminStack();

  return stack.track.readTrack({ userId, isAdministrator: true }, reportId);
}

export function formatTrackDate(value: Date | null): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(value);
}
