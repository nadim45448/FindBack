/**
 * The centred auth card used by `/login` and `/register`.
 *
 * The generated mockups (`public/02-login.html`, `public/03-register.html`)
 * put the form in a bordered card, vertically centred below the topbar.
 * That is the layout these surfaces share; the form itself is the content.
 */

/** The auth card's props. */
export interface AuthCardProps {
  readonly children: React.ReactNode;
  /** Register uses a slightly wider card than login. */
  readonly wide?: boolean | undefined;
}

/** A centred auth card. */
export function AuthCard({ children, wide = false }: AuthCardProps): React.JSX.Element {
  return (
    <div className="auth-shell">
      <div className={wide ? 'auth-card auth-card--wide' : 'auth-card'}>{children}</div>
    </div>
  );
}

/** The footer under an auth form — a prompt and a single link. */
export function AuthFooter({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <p className="auth-footer">{children}</p>;
}
