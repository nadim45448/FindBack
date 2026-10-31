import type { Metadata } from 'next';
import Link from 'next/link';

import {
  BACK_TO_SIGN_IN,
  FORGOT_SENT_HEADING,
  FORGOT_SENT_RETRY_AFTER,
  FORGOT_SENT_RETRY_BEFORE,
  FORGOT_SENT_RETRY_HEADING,
  FORGOT_SENT_TRY_AGAIN,
  NEUTRAL_RESET_CONFIRMATION,
} from '@/ui/copy';

export const metadata: Metadata = {
  title: 'Check your email',
};

/**
 * The forgot-password confirmation surface.
 *
 * ## The body is the domain's constant, not a copy
 *
 * §9.3a: *"Body: `If an account exists for that email address, password
 * reset instructions have been sent.`"*
 *
 * **The constant is re-exported from the domain**
 * (`NEUTRAL_RESET_CONFIRMATION`), because the anti-enumeration rule owns
 * the exact wording — a second copy of the text would be a second thing to
 * keep identical, and this surface is the one place where being one
 * character off would matter.
 *
 * ## The surface says nothing about the account
 *
 * There is no branch here, and there is nothing to branch on: the request
 * that led here has already been answered, and its answer was the same for
 * every account state. A registered address, an unregistered address, and
 * an address in any of the four lifecycle states all render **this page**,
 * with **this body**.
 *
 * The recovery hint ("Didn't get the email?") is the generated mockup's.
 * It does not name whether an account exists — trying again is always
 * available.
 */
export default function ForgotPasswordSentPage(): React.JSX.Element {
  return (
    <div className="narrow-page">
      <h1 className="hero__title">{FORGOT_SENT_HEADING}</h1>

      <p className="hero__lede">{NEUTRAL_RESET_CONFIRMATION}</p>

      <div className="alert alert--info" role="status">
        <span aria-hidden="true">ℹ</span>
        <div>
          <strong>{FORGOT_SENT_RETRY_HEADING}</strong> {FORGOT_SENT_RETRY_BEFORE}{' '}
          <Link href="/forgot" className="forgot-sent__retry">
            {FORGOT_SENT_TRY_AGAIN}
          </Link>
          {FORGOT_SENT_RETRY_AFTER}
        </div>
      </div>

      <p className="narrow-page__back">
        <Link href="/login" className="button button--primary">
          {BACK_TO_SIGN_IN}
        </Link>
      </p>
    </div>
  );
}
