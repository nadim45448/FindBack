import type { Metadata } from 'next';

import { PENDING_CLAIMS_COLUMNS } from '@/ui/admin-queue-surface';

import { renderQueuePage } from '../_queue-page';

export const metadata: Metadata = {
  title: 'Pending claims',
};

/**
 * The Pending Claims queue — §15.3.
 *
 * **Found-side only.** The queue's filter names the report's type, so a
 * Lost report's Claims cannot appear here.
 */
export default async function PendingClaimsPage(): Promise<React.JSX.Element> {
  return renderQueuePage('pending-claims', PENDING_CLAIMS_COLUMNS);
}
