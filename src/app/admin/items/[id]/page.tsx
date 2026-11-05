import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminItemTrackSurface } from '@/ui/admin-item-track-surface';
import { contextualAuditHref } from '@/ui/admin-contextual-audit-href';
import { ADMIN_TRACK_HEADING } from '@/ui/admin-copy';

import { resolveAdminAccess } from '../../_admin-page';
import { formatTrackDate, readItemTrack } from '../../_item-track-page';
import { formatTimestamp } from '../../_queue-page';

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return { title: ADMIN_TRACK_HEADING };
  }

  const reading = await readItemTrack(access.userId, id);

  return { title: reading ? `${reading.itemName} — record` : ADMIN_TRACK_HEADING };
}

/**
 * Found item record — `/admin/items/:id` (§9.5 item administration, read-only).
 */
export default async function FoundItemTrackPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/returned" />;
  }

  const { id } = await params;
  const reading = await readItemTrack(access.userId, id);

  if (!reading || reading.reportType !== 'Found') {
    return (
      <div className="admin-console">
        <h1 className="hero__title">{ADMIN_TRACK_HEADING}</h1>
        <div className="banner banner--info" role="status">
          <p>No Found report with that id.</p>
        </div>
        <p>
          <Link href="/admin/returned" className="button button--secondary button--sm">
            Back to returned items
          </Link>
        </p>
      </div>
    );
  }

  return (
    <AdminItemTrackSurface
      reading={reading}
      auditHref={contextualAuditHref('Found', id)}
      backHref="/admin/returned"
      formatTimestamp={formatTimestamp}
      formatDate={formatTrackDate}
    />
  );
}
