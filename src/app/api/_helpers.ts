/**
 * The shared route-handler helpers for the identity endpoints.
 *
 * **Route handlers stay thin**: parse the input, call the use case, map the
 * result to a response. No business rules live here (coding-standards § File
 * and folder organization).
 *
 * The helpers here are the *mechanical* parts of that rule — reading a
 * cookie, mapping a typed error to a status code — so no route has to
 * re-implement them and get one subtly different.
 */

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { createRequestContext, type LogActorRole, type LogOutcome } from '@/domain/audit';

import {
  DuplicateEmailError,
  PasswordHashVerificationError,
  AuthenticationError,
} from '@/domain/accounts';
import {
  DomainError,
  IllegalTransitionError,
  NotFoundError,
  PermissionDeniedError,
  QuotaExceededError,
  ValidationError,
} from '@/lib/errors';
import { createRequestId } from '@/lib/logging';

import { SESSION_COOKIE_NAME } from '@/infrastructure/accounts/cookie-session-store';
import { ANONYMOUS_TOKEN_COOKIE_NAME } from '@/app/api/auth/anonymous-session/route';
import { StdoutOperationalLogger } from '@/infrastructure/audit/stdout-operational-logger';
import type { OperationalLogger } from '@/application/ports/operational-logger';

/**
 * The operational logger.
 *
 * The log line's shape is fixed by `RequestContext` — a **closed** type with
 * no field capable of holding a sensitive value. That is the mechanism that
 * keeps an email address, a password, a hash, and a session token out of
 * the logs: a developer cannot log one because there is nowhere to put one.
 */
let logger: OperationalLogger = new StdoutOperationalLogger();

/** Replace the logger. Used by a test that captures the log lines. */
export function setOperationalLogger(replacement: OperationalLogger): void {
  logger = replacement;
}

/**
 * Write one structured log line.
 *
 * The `ts` timestamp is filled in, and the shape is closed — so a caller
 * cannot accidentally add a field that could carry a secret.
 */
export function log(
  requestId: string,
  action: string,
  outcome: LogOutcome,
  options: {
    readonly actorId?: string | undefined;
    readonly actorRole?: LogActorRole;
    readonly targetType?: string | undefined;
    readonly targetId?: string | undefined;
  } = {},
): void {
  logger.log(
    createRequestContext({
      requestId,
      action,
      outcome,
      actorId: options.actorId,
      actorRole: options.actorRole ?? 'anonymous',
      targetType: options.targetType,
      targetId: options.targetId,
    }),
  );
}

/**
 * The `__Host-` session cookie's value, or null.
 *
 * The cookie is **always** `Secure` — including in local development —
 * because a `__Host-` cookie missing `Secure` is rejected outright by the
 * browser. `http://localhost` is a trustworthy origin, so `Secure` works
 * locally with no conditional.
 */
export async function readSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();

  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * The token whose hash the CSRF token is derived from.
 *
 * **Either the session cookie or the anonymous cookie.**
 *
 * The CSRF token is an HMAC over a *token's* hash, not over a session
 * row, so a signed-out visitor can hold one too — the anonymous cookie
 * issued by `POST /api/auth/anonymous-session`. Which cookie is present
 * does not matter to the derivation; what matters is that the token and the
 * cookie came from the same issuance.
 *
 * **The session cookie wins when both are present**, because it is the one
 * with a meaning behind it: a visitor who has signed in must not have
 * their form tokens validated against a stale anonymous cookie.
 */
export async function readCsrfBindingToken(): Promise<string | null> {
  const cookieStore = await cookies();

  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (session) {
    return session;
  }

  return cookieStore.get(ANONYMOUS_TOKEN_COOKIE_NAME)?.value ?? null;
}

/** The request id for the current request. */
export async function readRequestId(): Promise<string> {
  const headerStore = await headers();
  const incoming = headerStore.get('x-request-id');

  return incoming ?? createRequestId();
}

/** The client's IP address, for the rate limiter's IP bucket. */
export async function readClientIp(): Promise<string> {
  const headerStore = await headers();

  // Vercel sets `x-forwarded-for`; the first entry is the client.
  const forwarded = headerStore.get('x-forwarded-for');

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  return headerStore.get('x-real-ip') ?? 'unknown';
}

/** The CSRF token from the request header. */
export async function readCsrfToken(): Promise<string | null> {
  const headerStore = await headers();

  return headerStore.get('x-csrf-token');
}

/**
 * Map a thrown error to a response.
 *
 * **Expected domain errors are business outcomes, not failures**: they get a
 * status code and a message, never a stack trace. Anything else is a
 * genuine defect — it is logged as one and answered with a generic 500, so
 * an internal message never reaches a member.
 */
export function errorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message, field: error.field }, { status: 422 });
  }

  if (error instanceof DuplicateEmailError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof AuthenticationError) {
    // The single refusal. Every refused login returns this body, byte for
    // byte — that is the anti-enumeration rule.
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  if (error instanceof IllegalTransitionError) {
    return NextResponse.json(
      { error: 'That action was already decided by someone else.' },
      { status: 409 },
    );
  }

  if (error instanceof QuotaExceededError) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 },
    );
  }

  if (error instanceof PasswordHashVerificationError) {
    // A corrupt stored hash is a defect, not a login failure. It is logged
    // as a defect and answered generically.
    log(requestId, 'account.password_hash_defect', 'error');

    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  if (error instanceof DomainError) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Not a domain error — a genuine defect.
  log(requestId, 'account.unhandled_error', 'error');

  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

/**
 * Parse a JSON request body.
 *
 * @throws {ValidationError} when the body is not a JSON object.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    throw new ValidationError('body', 'The request body must be valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('body', 'The request body must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

/**
 * Read a string field from a parsed body.
 *
 * A missing field is an empty string, which the value objects then reject
 * with a message that names the field.
 */
export function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];

  return typeof value === 'string' ? value : '';
}

/**
 * Read an optional string field from a parsed body.
 */
export function optionalStringField(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];

  return typeof value === 'string' && value.length > 0 ? value : null;
}
