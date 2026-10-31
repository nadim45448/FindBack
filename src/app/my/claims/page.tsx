import type { Metadata } from 'next';

import { emptyFilter } from '@/domain/listings';
import { isClaimStatus, type ClaimStatus } from '@/domain/listings/claim-status';

import { MyClaimsSurface, SERVER_ERROR_MESSAGE } from '@/ui/my-claims-surface';

import { readCampusAreaLabels } from '../_campus-area-labels';
import { requireMember } from '../_member-page';
import { MEMBER_READ_FAILED, readMemberView } from '../_member-view-page';

export const metadata: Metadata = {
  title: 'My claims',
};

/**
 * `My Claims` — §9.4, mockup `10-my-claims.html`.
 */
export default async function MyClaimsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>;
}): Promise<React.JSX.Element> {
  const actor = await requireMember('/my/claims');

  const params = await searchParams;
  const statusFilter = claimStatusFromParams(params['status']);

  const result = await readMemberView(
    actor,
    'claims',
    statusFilter ? { ...emptyFilter(), participationStatuses: [statusFilter] } : emptyFilter(),
  );

  if (result.kind !== 'Claims') {
    return (
      <MyClaimsSurface
        rows={[]}
        campusAreaLabels={{}}
        statusFilter={statusFilter}
        error={result.kind === 'Failed' ? MEMBER_READ_FAILED : SERVER_ERROR_MESSAGE}
      />
    );
  }

  const campusAreaLabels = await readCampusAreaLabels();

  return (
    <MyClaimsSurface
      rows={result.rows}
      campusAreaLabels={campusAreaLabels}
      statusFilter={statusFilter}
    />
  );
}

function claimStatusFromParams(value: string | string[] | undefined): ClaimStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || raw.length === 0) {
    return null;
  }

  return isClaimStatus(raw) ? raw : null;
}
