import type { Metadata } from 'next';

import { RESET_PASSWORD_HEADING, RESET_PASSWORD_LEDE } from '@/ui/copy';

import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
};

/**
 * The reset-password page.
 *
 * **The token never reaches this page's URL.** The reset link carries the
 * token in its **fragment**, after the `#`.
 */
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <div className="narrow-page">
      <h1 className="hero__title">{RESET_PASSWORD_HEADING}</h1>
      <p className="hero__lede">{RESET_PASSWORD_LEDE}</p>
      <ResetPasswordForm />
    </div>
  );
}
