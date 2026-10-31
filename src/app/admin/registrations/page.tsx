import type { Metadata } from 'next';

import { PENDING_REGISTRATIONS_COLUMNS } from '@/ui/admin-queue-surface';

import { renderQueuePage } from '../_queue-page';

export const metadata: Metadata = {
  title: 'Pending registrations',
};

/**
 * The Pending Registrations queue — §15.2.
 *
 * **The columns are the queue's own** — name, email, self-declared role,
 * registration timestamp — and the action column is appended by the
 * surface, because §15.2 names an "action" column too.
 */
export default async function PendingRegistrationsPage(): Promise<React.JSX.Element> {
  return renderQueuePage('pending-registrations', PENDING_REGISTRATIONS_COLUMNS);
}
