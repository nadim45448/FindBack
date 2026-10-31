/**
 * `POST /api/auth/forgot-password` — request a password reset (FR-51).
 *
 * **Every well-formed request returns 202 and the same body.** A registered
 * address receives the reset email. An unregistered address receives the
 * same confirmation screen and no email.
 *
 * **The route is where the rate limit lives**, before the use case — ADR-8's
 * rule, so a request that will be refused does not pay the ~81 ms of
 * Argon2id. **But the floor still applies to the refused path.** This is a
 * deliberate departure from ADR-15's login precedent, and the reason is
 * specific: the login path's refusal is a `GenericInactiveMessage` that is
 * identical in *every* case, so there is no "accepted" variant for a
 * refusal to be distinguishable from. The reset path has one — a 202 with a
 * neutral confirmation — and the refusal is a 429 with a different body. If
 * their timing also differed, the refusal would be distinguishable by timing
 * alone, and a 429 that arrives instantly would say "this address has been
 * requested recently". The floor closes that channel (ADR-18).
 *
 * **The email bucket's key is a keyed digest, not the address** (ADR-19), so
 * the counter table cannot answer "which addresses were reset".
 *
 * **The email is sent after the commit** (PRD §10): a failed email must
 * never block the action, and a member must not be able to learn that an
 * account exists *because the email failed*.
 */

import { NextResponse } from 'next/server';

import { isPlausibleEmailShape, normalizeEmail } from '@/domain/accounts';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildResetLink } from '@/infrastructure/accounts/reset-token-generator';
import { buildPasswordResetEmail } from '@/application/accounts/password-reset-email';

import {
  log,
  errorResponse,
  readClientIp,
  readCsrfBindingToken,
  readCsrfToken,
  readJsonBody,
  readRequestId,
  stringField,
} from '@/app/api/_helpers';

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = await readRequestId();
  const startedAt = Date.now();

  try {
    const stack = buildIdentityStack();
    const clientIp = await readClientIp();
    const body = await readJsonBody(request);
    const email = normalizeEmail(stringField(body, 'email'));

    // ── CSRF ──────────────────────────────────────────────────────────────
    //
    // The reset request is unauthenticated but still cross-site-forgeable, so
    // it carries a CSRF token like every other state-changing request.
    //
    // **The binding token is the session cookie when there is one, and the
    // anonymous cookie otherwise.** The CSRF token is an HMAC over a token's
    // hash, not over a session row, so a signed-out visitor can hold one —
    // the anonymous cookie issued by `POST /api/auth/anonymous-session`.
    const bindingToken = await readCsrfBindingToken();
    const csrfToken = await readCsrfToken();
    const csrf = stack.csrf.validate(
      bindingToken ? stack.tokens.hashToken(bindingToken) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The malformed-address case ────────────────────────────────────────
    //
    // A syntactically invalid address is a malformed **request**, so it is
    // rejected with 400. This is **not** an existence disclosure: the
    // request never reached the account lookup.
    if (!isPlausibleEmailShape(email)) {
      return NextResponse.json(
        { error: 'Enter a valid email address.', field: 'email' },
        { status: 400 },
      );
    }

    // ── The two rate-limit buckets ────────────────────────────────────────
    //
    // **Both must pass.** IP-only would let one attacker lock out a campus
    // behind a NAT; email-only would turn the throttle into an
    // account-existence oracle.
    //
    // The email bucket's key is a **keyed digest** of the normalized
    // address, never the address itself (ADR-19).
    const emailBucketKey = stack.bucketKeys.keyFor(email);

    const ipDecision = await stack.rateLimiter.consume(
      `reset:ip:${clientIp}`,
      stack.resetConfig.ipLimit,
      stack.resetConfig.ipWindowSeconds,
    );

    const emailDecision = await stack.rateLimiter.consume(
      `reset:email:${emailBucketKey}`,
      stack.resetConfig.emailLimit,
      stack.resetConfig.emailWindowSeconds,
    );

    if (!ipDecision.allowed || !emailDecision.allowed) {
      // **The refusal body is the same in both cases** and does not say which
      // bucket refused. A 429 is not an existence oracle: exceeding a limit
      // for an address that does not exist is possible, and must look
      // identical.
      log(requestId, 'password_reset.requested', 'denied', {
        actorRole: 'anonymous',
        targetType: 'account',
        // The **keyed hash**, not the address — so the log cannot answer
        // "which addresses were reset" either.
        targetId: emailBucketKey,
      });

      // **The floor applies to the refused path too** (ADR-18). The work was
      // skipped; the delay is not.
      await holdFloor(startedAt, stack.resetConfig.minResponseMs);

      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(ipDecision.retryAfterSeconds) },
        },
      );
    }

    // ── The use case ──────────────────────────────────────────────────────
    //
    // The service performs the dummy Argon2id verification and applies the
    // floor, and it builds the response from one value.
    const outcome = await stack.transactions.run((transaction) =>
      stack.resetRequest.execute(email, transaction),
    );

    // ── Unknown address ───────────────────────────────────────────────────
    //
    // No token is issued and no email is sent. The confirmation is the
    // same as a hit, so the screen does not disclose whether the account
    // exists.
    if (outcome.emailRecipient && outcome.tokenPlaintext) {
      // The transaction has committed, so a failed send cannot roll back
      // the token issue (PRD §10). A send failure is logged and swallowed.
      await sendResetEmail(
        stack,
        outcome.emailRecipient,
        outcome.displayName ?? '',
        outcome.tokenPlaintext,
      );
    }

    log(requestId, 'password_reset.requested', 'success', {
      actorRole: 'anonymous',
      targetType: 'account',
      targetId: emailBucketKey,
    });

    return NextResponse.json({ message: outcome.confirmation.value }, { status: 202 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/**
 * Send the reset email, swallowing a failure.
 *
 * A failed send is **logged** with the fact and the error class, never the
 * address or the token. It never fails the request — the request already
 * returned its neutral 202, and the action stands.
 */
async function sendResetEmail(
  stack: ReturnType<typeof buildIdentityStack>,
  to: string,
  displayName: string,
  tokenPlaintext: string,
): Promise<void> {
  const resetUrl = buildResetLink(stack.appBaseUrl, tokenPlaintext);

  if (!stack.email) {
    // No SMTP configured. In local development the link is printed so
    // the reset can still be completed without a mailbox.
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[findback] SMTP is not configured. Password reset link: ${resetUrl}`);
    }

    return;
  }

  const message = buildPasswordResetEmail(to, {
    displayName,
    resetUrl,
    lifetimeSeconds: stack.resetConfig.tokenLifetimeSeconds,
  });

  try {
    await stack.email.send(message);

    if (process.env.NODE_ENV !== 'production') {
      console.info('[findback] Password reset email sent. Open Mailpit at http://localhost:8025');
    }
  } catch (error) {
    console.error(
      '[findback] Password reset email failed',
      error instanceof Error ? error.message : 'unknown error',
    );
  }
}

/**
 * Hold the response to the floor.
 *
 * The same constant the use case applies, so the refused path and the
 * accepted path take the same time.
 */
async function holdFloor(startedAt: number, minResponseMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  const remaining = minResponseMs - elapsed;

  if (remaining <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, remaining);
  });
}
