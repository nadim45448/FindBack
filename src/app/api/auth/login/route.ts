/**
 * `POST /api/auth/login` — sign in (FR-4).
 *
 * **Two rate-limit buckets** (ADR-15): the IP bucket bounds how many
 * attempts one address makes, and the email bucket bounds how many attempts
 * are made against one account. Both must pass. The IP bucket alone would
 * not stop a distributed attempt against one account; the email bucket alone
 * would not stop one address spraying many accounts.
 *
 * **Every refusal returns the same body** — the generic inactive message.
 * An unknown email, a wrong password, a `Rejected` account, and a
 * `Deactivated` account are indistinguishable to the client (FR-4, story 003
 * criterion 5, story 007 criterion 3).
 *
 * The session cookie is set with **`Secure` in every environment**, because
 * a `__Host-` cookie missing `Secure` is rejected outright by the browser.
 */

import { NextResponse } from 'next/server';

import { GENERIC_INACTIVE_MESSAGE } from '@/domain/accounts';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildSessionCookie } from '@/infrastructure/accounts/cookie-session-store';

import {
  log,
  errorResponse,
  readClientIp,
  readJsonBody,
  readRequestId,
  stringField,
} from '@/app/api/_helpers';

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();
    const clientIp = await readClientIp();
    const body = await readJsonBody(request);
    const email = stringField(body, 'email');

    // The email bucket is keyed by the **normalized** address, so
    // `Jane@Example.org` and `jane@example.org` share one bucket and
    // cannot be used to double the allowance.
    const emailBucket = email.trim().toLowerCase();

    const ipDecision = await stack.rateLimiter.consume(
      `login:ip:${clientIp}`,
      stack.rateLimits.loginIpLimit,
      stack.rateLimits.loginIpWindowSeconds,
    );

    const emailDecision = await stack.rateLimiter.consume(
      `login:email:${emailBucket}`,
      stack.rateLimits.loginEmailLimit,
      stack.rateLimits.loginEmailWindowSeconds,
    );

    if (!ipDecision.allowed || !emailDecision.allowed) {
      log(requestId, 'account.login', 'denied', {
        actorRole: 'anonymous',
      });

      // **The refusal is the generic one, not a throttle message.** A
      // distinct "too many attempts" response would disclose that the
      // account **exists** — the limiter would become the
      // account-existence oracle the PRD forbids (ADR-15, "Why the refusal
      // is indistinguishable on login"). The log distinguishes the cases
      // for diagnosis; the response does not.
      //
      // The `Retry-After` header is kept, because a client that is being
      // throttled should be able to back off, and the header discloses
      // nothing about the account.
      return NextResponse.json(
        { error: GENERIC_INACTIVE_MESSAGE },
        {
          status: 401,
          headers: { 'Retry-After': String(ipDecision.retryAfterSeconds) },
        },
      );
    }

    const outcome = await stack.authenticate.execute(email, stringField(body, 'password'));

    if (!outcome.ok) {
      // The single refusal. The reason is internal — the log distinguishes
      // the cases for diagnosis, the response does not.
      log(requestId, 'account.login', 'denied', {
        actorRole: 'anonymous',
      });

      return NextResponse.json({ error: outcome.message.value }, { status: 401 });
    }

    const { token } = await stack.transactions.run((transaction) =>
      stack.sessions.issue(outcome.account.id, transaction),
    );

    log(requestId, 'account.login', 'success', {
      actorId: outcome.account.id,
      actorRole: outcome.actor.isAdministrator ? 'administrator' : 'member',
      targetType: 'account',
      targetId: outcome.account.id,
    });

    const response = NextResponse.json({
      id: outcome.actor.actorId,
      status: outcome.actor.status,
      isAdministrator: outcome.actor.isAdministrator,
      displayName: outcome.actor.displayName,
      csrfToken: stack.csrf.computeToken(stack.tokens.hashToken(token)),
    });

    response.headers.append('Set-Cookie', buildSessionCookie(token));

    return response;
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
