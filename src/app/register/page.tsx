import type { Metadata } from 'next';

import { AuthCard } from '@/ui/auth-card';
import { RegisterForm } from '@/ui/register-form';

export const metadata: Metadata = {
  title: 'Register',
};

/**
 * The register page.
 *
 * **A server component that renders a client component.** The form needs
 * the browser to submit and to validate as the visitor types.
 */
export default function RegisterPage(): React.JSX.Element {
  return (
    <AuthCard wide>
      <RegisterForm />
    </AuthCard>
  );
}
