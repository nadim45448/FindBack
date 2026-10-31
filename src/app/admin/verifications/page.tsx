import type { Metadata } from 'next';

import { VERIFICATIONS_COLUMNS } from '@/ui/admin-queue-surface';

import { renderQueuePage } from '../_queue-page';

export const metadata: Metadata = {
  title: 'Items in verification',
};

/**
 * The Items in Verification queue — §15.5.
 *
 * **Lost-side only.** The queue's filter names the report's type, so a
 * Found report cannot appear here.
 */
export default async function VerificationsPage(): Promise<React.JSX.Element> {
  return renderQueuePage('verifications', VERIFICATIONS_COLUMNS);
}
