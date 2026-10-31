import type { Metadata } from 'next';

import { emptyFilter } from '@/domain/listings';
import {
  isRecoveryResponseStatus,
  type RecoveryResponseStatus,
} from '@/domain/recovery/recovery-response-status';

import { MyRecoveryResponsesSurface } from '@/ui/my-recovery-responses-surface';

import { readCampusAreaLabels } from '../_campus-area-labels';
import { requireMember } from '../_member-page';
import { MEMBER_READ_FAILED, readMemberView } from '../_member-view-page';

export const metadata: Metadata = {
  title: 'My recovery responses',
};

/**
 * `My Recovery Responses` — §9.4, mockup `18-my-recovery-responses.html`.
 */
export default async function MyRecoveryResponsesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>;
}): Promise<React.JSX.Element> {
  const actor = await requireMember('/my/recovery-responses');

  const params = await searchParams;
  const statusFilter = recoveryStatusFromParams(params['status']);

  const result = await readMemberView(
    actor,
    'recovery_responses',
    statusFilter ? { ...emptyFilter(), participationStatuses: [statusFilter] } : emptyFilter(),
  );

  if (result.kind !== 'RecoveryResponses') {
    return (
      <MyRecoveryResponsesSurface
        rows={[]}
        campusAreaLabels={{}}
        statusFilter={statusFilter}
        error={MEMBER_READ_FAILED}
      />
    );
  }

  const campusAreaLabels = await readCampusAreaLabels();

  return (
    <MyRecoveryResponsesSurface
      rows={result.rows}
      campusAreaLabels={campusAreaLabels}
      statusFilter={statusFilter}
    />
  );
}

function recoveryStatusFromParams(
  value: string | string[] | undefined,
): RecoveryResponseStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || raw.length === 0) {
    return null;
  }

  return isRecoveryResponseStatus(raw) ? raw : null;
}
