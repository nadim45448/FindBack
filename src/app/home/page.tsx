import type { Metadata } from 'next';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { MemberHomeSurface } from '@/ui/member-home-surface';

import { MEMBER_READ_FAILED } from '../my/_member-page';
import { requireMember } from '../my/_member-page';

export const metadata: Metadata = {
  title: 'Dashboard',
};

/**
 * The member dashboard — §9.4's `/home`.
 *
 * ## The page is a server component with no read of its own
 *
 * **The route resolves the member and reads dashboard summary counts** —
 * open reports, pending/approved claims, and returned items — matching
 * mockup `07-dashboard.html`. There is still no activity feed; the tiles
 * are counts only.
 *
 * **The display name comes from the resolved actor,** not from a fetch:
 * the actor resolution already carries it.
 */
export default async function HomePage(): Promise<React.JSX.Element> {
  const actor = await requireMember('/home');

  let stats = null;

  try {
    stats = await buildListingsStack().memberDashboard.read(actor);
  } catch {
    stats = null;
  }

  return (
    <MemberHomeSurface
      displayName={actor.displayName}
      stats={stats}
      statsError={stats === null ? MEMBER_READ_FAILED : undefined}
    />
  );
}
