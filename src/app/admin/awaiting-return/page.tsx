import type { Metadata } from 'next';

import { AWAITING_RETURN_COLUMNS } from '@/ui/admin-queue-surface';

import { renderQueuePage } from '../_queue-page';

export const metadata: Metadata = {
  title: 'Awaiting return',
};

/**
 * The Items Awaiting Return queue — §15.4.
 *
 * **Found-side only, and only `Claim Approved`.** The queue's filter names
 * the report's type and status.
 */
export default async function AwaitingReturnPage(): Promise<React.JSX.Element> {
  return renderQueuePage('awaiting-return', AWAITING_RETURN_COLUMNS);
}
