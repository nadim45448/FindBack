import type { Metadata } from 'next';

import { AuthCard } from '@/ui/auth-card';
import { LoginForm } from '@/ui/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

/**
 * The login page.
 *
 * **A server component that renders a client component.** The form needs
 * the browser — to submit, to read the session, and to route — so the form
 * is the client half and the page is the thin shell around it.
 *
 * ## The `Rejected` and `Deactivated` states have no route
 *
 * Story 002's criterion: *"no `/rejected` route and no `/deactivated`
 * route exists"*. There is no such directory under `src/app/`, and the
 * neutral error is rendered **by the login form**, on this screen.
 */
export default function LoginPage(): React.JSX.Element {
  return (
    <AuthCard>
      <LoginForm />
    </AuthCard>
  );
}
