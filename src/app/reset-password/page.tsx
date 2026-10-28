import { ResetPasswordForm } from './reset-password-form';

/**
 * The reset-password page.
 *
 * **The token never reaches this page's URL.** The reset link carries the
 * token in its **fragment**, after the `#`. A fragment is not sent to the
 * server, so it is not in the request line, and it is therefore not in the
 * platform's access log.
 *
 * The page is a **server component** that renders a **client component**,
 * because only the browser can read a fragment. The client component reads
 * the token and posts it in the request body.
 *
 * **The page must not be cached.** A cached page would keep the token's
 * context alive in a shared cache, and the token is a credential. The
 * `force-dynamic` directive below is the mechanism, and it is not optional.
 *
 * The page's **markup** belongs to Unit 007 (web surfaces), which owns the
 * screens. What this bolt owns is the part that touches the credential: the
 * token's path from the email to the form, and the guarantee that it never
 * appears in a log or a cache.
 */
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <main
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '28px', lineHeight: 1.2 }}>
        Choose a new password
      </h1>

      <ResetPasswordForm />
    </main>
  );
}
