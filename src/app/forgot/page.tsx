import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/ui/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password',
};

/**
 * The forgot-password page.
 *
 * **A server component that renders a client component.** The form needs
 * the browser to submit and to carry the CSRF token.
 */
export default function ForgotPasswordPage(): React.JSX.Element {
  return (
    <div className="narrow-page">
      <ForgotPasswordForm />
    </div>
  );
}
