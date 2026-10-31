import type { Metadata } from 'next';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import { PROFILE_HEADING, SERVER_ERROR_MESSAGE } from '@/ui/member-copy';
import { ProfileSurface } from '@/ui/profile-surface';

import { requireMember } from '../_member-page';

export const metadata: Metadata = {
  title: 'My profile',
};

/**
 * The member profile — `/my/profile` (FR-52 / EXPERIENCE.md §9.4a).
 *
 * **Only an Active member reaches this page.** `requireMember` sends an
 * anonymous visitor to sign in; a Pending session is kept on `/pending`
 * by the shell.
 */
export default async function ProfilePage(): Promise<React.JSX.Element> {
  const actor = await requireMember('/my/profile');
  const profile = await readProfile(actor.actorId);

  if (!profile) {
    return (
      <div className="form-column">
        <h1 className="hero__title">{PROFILE_HEADING}</h1>
        <p className="hero__lede">{SERVER_ERROR_MESSAGE}</p>
      </div>
    );
  }

  return <ProfileSurface initial={profile} />;
}

async function readProfile(actorId: string): Promise<{
  displayName: string;
  email: string;
  selfDeclaredRole: string;
  selfDeclaredRoleOther: string | null;
} | null> {
  try {
    const account = await buildIdentityStack().profile.read(actorId);

    return {
      displayName: account.displayName.value,
      email: account.email.value,
      selfDeclaredRole: account.selfDeclaredRole.role,
      selfDeclaredRoleOther: account.selfDeclaredRole.otherText,
    };
  } catch {
    return null;
  }
}
