import type { Metadata } from 'next';

import { renderAuditPage } from '../../../_audit-page';

export const metadata: Metadata = {
  title: 'Audit trail',
};

/**
 * The Found-side contextual audit — §17.1.
 *
 * **`/admin/items/:id/audit`** is the Found report's trail. The route
 * exists only here and at `/admin/lost/:id/audit` — there is no
 * `/admin/audit` route, because audit is contextual (§17.1).
 */
export default async function ItemAuditPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{ readonly from?: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const query = await searchParams;

  return renderAuditPage(id, 'Found', { afterReturn: query.from === 'return' });
}
