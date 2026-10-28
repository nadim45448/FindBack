/**
 * `POST /api/auth/register` — self-registration (FR-1).
 *
 * Creates a `Pending` account and **sends no email** (FR-1).
 *
 * **The rate limit is enforced here, in the route handler, before the use
 * case runs** (ADR-15). The limiter is a policy about traffic, not about
 * the account lifecycle, and it must run *before* the expensive work — for
 * login, before the ~160 ms Argon2id verification.
 *
 * The registration bucket is **IP-only** (ADR-15): an email-keyed bucket
 * would add a second account-existence channel ahead of FR-1's required 409,
 * and the IP bucket already bounds how many accounts one address can create.
 */

import { NextResponse } from 'next/server';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import {
  log,
  errorResponse,
  optionalStringField,
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

    const decision = await stack.rateLimiter.consume(
      `register:ip:${clientIp}`,
      stack.rateLimits.registerLimit,
      stack.rateLimits.registerWindowSeconds,
    );

    if (!decision.allowed) {
      log(requestId, 'account.registered', 'denied', {
        actorRole: 'anonymous',
      });

      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } },
      );
    }

    const body = await readJsonBody(request);

    const account = await stack.transactions.run((transaction) =>
      stack.accounts.execute(
        {
          displayName: stringField(body, 'displayName'),
          email: stringField(body, 'email'),
          password: stringField(body, 'password'),
          selfDeclaredRole: stringField(body, 'selfDeclaredRole'),
          selfDeclaredRoleOther: optionalStringField(body, 'selfDeclaredRoleOther'),
        },
        transaction,
      ),
    );

    log(requestId, 'account.registered', 'success', {
      actorId: account.account.id,
      actorRole: 'member',
      targetType: 'account',
      targetId: account.account.id,
    });

    // 201 with the account's status. **No email is sent** (FR-1).
    return NextResponse.json({ status: account.account.status }, { status: 201 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
