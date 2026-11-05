import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminReturnedListSurface } from '@/ui/admin-returned-list-surface';
import { ADMIN_RETURNED_HEADING } from '@/ui/admin-copy';

import { ADMIN_READ_FAILED, resolveAdminAccess } from '../_admin-page';
import { readReturnedItems } from '../_item-track-page';
import { formatTimestamp } from '../_queue-page';

export const metadata: Metadata = {
  title: ADMIN_RETURNED_HEADING,
};

export default async function AdminReturnedPage(): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin" />;
  }

  try {
    const rows = await readReturnedItems(access.userId);

    return (
      <AdminReturnedListSurface rows={rows} formatTimestamp={formatTimestamp} />
    );
  } catch {
    return (
      <div className="admin-console">
        <h1 className="hero__title">{ADMIN_RETURNED_HEADING}</h1>
        <div className="banner banner--info" role="status">
          <p>{ADMIN_READ_FAILED}</p>
        </div>
      </div>
    );
  }
}
