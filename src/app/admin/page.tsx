import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminDashboardSurface } from '@/ui/admin-dashboard-surface';

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

import type { DashboardCounts } from '@/domain/administration';

import { ADMIN_READ_FAILED, buildAdminStack, resolveAdminAccess } from './_admin-page';

/**
 * The administrator dashboard — FR-33, §15.1.
 *
 * ## Four tiles, and nothing else
 *
 * The dashboard is a **routing surface**: its whole job is to send the
 * administrator to one of the four queues. So it reads four counts and
 * renders four links.
 *
 * **There is no `Recent activity` aggregation.** It was removed in the
 * 2026-09-17 reconciliation, and §15.1 names no replacement. The tile set
 * comes from the domain's closed `OPERATIONAL_QUEUES`, so a fifth tile
 * would have to be added to the domain — and the domain has four members
 * because there are four operational queues.
 *
 * ## The access screen carries no dashboard content
 *
 * A non-administrator reaching `/admin` sees §15.6's message and nothing
 * else. Not a count, not a queue name — a count is a leak of the queue's
 * contents, and the four queues' names are the shape of the operation.
 *
 * ## The counts are read on the server
 *
 * The counts come from the administration stack, through the same
 * `AdministratorDashboardQuery` the API would use, so the tile and the
 * queue are drawn from one filter and one reader.
 */
export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen />;
  }

  const { counts, error } = await readCounts(access.userId);

  return (
    <AdminDashboardSurface
      counts={counts}
      displayName={access.displayName}
      error={error}
    />
  );
}

/**
 * Read the four counts.
 *
 * **A failure is a rendered error, not a thrown one.** The dashboard is
 * an entry surface, and a 500 tells the administrator nothing actionable.
 */
async function readCounts(userId: string): Promise<{ counts: DashboardCounts | null; error?: string }> {
  try {
    const stack = buildAdminStack();
    const dashboard = await stack.dashboard.read({
      userId,
      isAdministrator: true,
    });

    return { counts: dashboard.counts };
  } catch {
    return { counts: null, error: ADMIN_READ_FAILED };
  }
}
