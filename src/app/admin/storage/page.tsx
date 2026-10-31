import type { Metadata } from 'next';

import { AdminStorageSurface } from '@/ui/admin-storage-surface';

export const metadata: Metadata = {
  title: 'Image storage',
};

import type { StorageUsageView } from '@/domain/administration';

import { ADMIN_READ_FAILED, buildAdminStack, resolveAdminAccess } from '../_admin-page';

/**
 * The administrator's image-storage page — image-handling §4.
 *
 * ## Why this page exists
 *
 * image-handling §4 says to *"Surface current bytes, this month's
 * Simple/Advanced operation counts, and remaining headroom to
 * administrators"*, and to *"Warn at 70% and 90% of quota. Refuse at
 * 100%."*
 *
 * The **refusal** at 100% is implemented on the write path, where it has to
 * be. The **warnings** need a place an administrator looks — and this is
 * it.
 *
 * ## Why it is not a dashboard tile
 *
 * §15.1 freezes the dashboard at four tiles, and the story's criteria name
 * the absences as load-bearing. A fifth tile would break a frozen
 * contract, so the budget has its own page and the dashboard is untouched.
 *
 * ## The authorisation is the page's own
 *
 * A non-administrator reaching this page sees the **access screen** and no
 * budget — not a byte count, not a percentage, not a signal that a read was
 * attempted. The use case refuses a non-administrator too, so there are two
 * gates: this one keeps the number out of the response, and the use case's
 * one keeps it out of the store.
 *
 * ## A failed read is a rendered error, not a thrown one
 *
 * The blob store may be unreachable. That is not the administrator's problem
 * to solve, and a 500 tells them nothing actionable — so the failure is
 * reported as a fact and the page renders its calm error state. The page
 * **never shows a number it did not read**.
 */
export default async function AdminStoragePage(): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminStorageSurface usage={null} error={access.message} />;
  }

  const { usage, error } = await readUsage(access.userId);

  return <AdminStorageSurface usage={usage} error={error} />;
}

/**
 * Read the storage budget.
 *
 * **A failure is a rendered error, not a thrown one.** The page is an
 * entry surface, and a 500 tells the administrator nothing actionable.
 */
async function readUsage(userId: string): Promise<{
  usage: StorageUsageView | null;
  error?: string;
}> {
  try {
    const stack = buildAdminStack();
    const result = await stack.storage.read({
      userId,
      isAdministrator: true,
    });

    return { usage: result.usage, error: result.error };
  } catch {
    return { usage: null, error: ADMIN_READ_FAILED };
  }
}
