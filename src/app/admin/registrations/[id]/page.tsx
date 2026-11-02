import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import {
  REGISTRATION_ALREADY_REVIEWED,
  REGISTRATION_APPROVE_HEADING,
  REGISTRATION_REJECT_HEADING,
} from '@/ui/admin-copy';
import {
  RegistrationReviewSurface,
  type RegistrationReviewMode,
} from '@/ui/registration-review-surface';

import { resolveAdminAccess } from '../../_admin-page';
import { formatTimestamp, readPendingRegistrationById } from '../../_queue-page';

export async function generateMetadata({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly decision?: string }>;
}): Promise<Metadata> {
  const { decision } = await searchParams;
  const mode = resolveRegistrationMode(decision);

  return {
    title: mode === 'reject' ? REGISTRATION_REJECT_HEADING : REGISTRATION_APPROVE_HEADING,
  };
}

/**
 * The registration review — `/admin/registrations/:id` (FR-3, FR-27).
 *
 * **Approve and reject are separate surfaces**, matching the BMAD mockups.
 * The queue links here with `?decision=approve` or `?decision=reject`.
 */
export default async function RegistrationReviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{ readonly decision?: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/registrations" />;
  }

  const { id } = await params;
  const { decision } = await searchParams;
  const mode = resolveRegistrationMode(decision);
  const registration = await readPendingRegistrationById(access.userId, id);

  if (!registration) {
    return (
      <div className="form-column">
        <h1 className="hero__title">
          {mode === 'reject' ? REGISTRATION_REJECT_HEADING : REGISTRATION_APPROVE_HEADING}
        </h1>

        <div className="banner banner--info" role="status">
          <p>{REGISTRATION_ALREADY_REVIEWED}</p>
        </div>
      </div>
    );
  }

  return (
    <RegistrationReviewSurface
      mode={mode}
      displayName={registration.displayName}
      email={registration.email}
      selfDeclaredRole={registration.selfDeclaredRole}
      submittedAtLabel={formatTimestamp(registration.registeredAt)}
      administratorName={access.displayName ?? 'Administrator'}
      endpoint={`/api/admin/registrations/${id}`}
      afterHref="/admin/registrations"
    />
  );
}

function resolveRegistrationMode(decision: string | undefined): RegistrationReviewMode {
  return decision === 'reject' ? 'reject' : 'approve';
}
