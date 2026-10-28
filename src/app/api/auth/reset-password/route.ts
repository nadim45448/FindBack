/**
 * `POST /api/auth/reset-password` — complete a password reset (FR-51).
 *
 * **Every token refusal returns the same body.** An absent, malformed,
 * unknown, used, and expired token are five different situations, and they
 * deliberately collapse into **one** 400 with **one** message — each
 * distinction is a probe into whether a given address has an account.
 *
 * **The response never contains a session.** A reset does not sign the
 * member in — the member signs in with their new password. Story 009's
 * criterion 1 says "the member can log in with the new password", not "the
 * member is signed in".
 *
 * **The token is redacted from the request log.** The reset link carries the
 * token in its query string, and a URL carrying a token is exactly what ends
 * up in an access log. The redaction happens on the way in, before anything
 * can log it.
 */

import { NextResponse } from 'next/server';

import { evaluatePasswordPolicy } from '@/domain/accounts';
import { InvalidResetTokenError } from '@/domain/accounts';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import {
  log,
  errorResponse,
  readCsrfToken,
  readJsonBody,
  readRequestId,
  readSessionCookie,
  stringField,
} from '@/app/api/_helpers';

/** The one message every token refusal returns. */
const INVALID_TOKEN_MESSAGE = 'This reset link is not valid. Request a new one.';

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();
    const body = await readJsonBody(request);

    // ── CSRF ──────────────────────────────────────────────────────────────
    const sessionToken = await readSessionCookie();
    const csrfToken = await readCsrfToken();
    const csrf = stack.csrf.validate(
      sessionToken ? stack.tokens.hashToken(sessionToken) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      return NextResponse.json({ error: 'Your request could not be verified.' }, { status: 403 });
    }

    const token = stringField(body, 'token');
    const newPassword = stringField(body, 'newPassword');

    // ── The token, redacted ───────────────────────────────────────────────
    //
    // The token is never logged. What is logged is the **fact** of the
    // attempt, and the reason class — never the token, and never the
    // account.
    const tokenFingerprint = token.length === 0 ? 'absent' : 'present';

    if (token.length === 0) {
      log(requestId, 'password_reset.completed', 'denied', {
        actorRole: 'anonymous',
        targetType: 'password_reset_token',
        targetId: tokenFingerprint,
      });

      return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
    }

    // ── The password policy ───────────────────────────────────────────────
    //
    // The policy is evaluated **before** the transaction, so a password that
    // fails it leaves the existing password valid — nothing was written.
    const policy = evaluatePasswordPolicy(newPassword);

    if (!policy.ok) {
      const messages = {
        tooShort: 'Your password must be at least 8 characters.',
        tooLong: 'Your password must be at most 200 characters.',
        noLetter: 'Your password must contain at least one letter.',
        noNumber: 'Your password must contain at least one number.',
      } as const;

      return NextResponse.json(
        { error: messages[policy.reason], field: 'newPassword' },
        { status: 400 },
      );
    }

    // ── The completion ────────────────────────────────────────────────────
    //
    // The conditional write and the hash replacement are **one transaction**,
    // so a token that was used and a password that was changed land
    // together or not at all.
    try {
      await stack.transactions.run((transaction) =>
        stack.resetCompletion.execute(token, newPassword, transaction),
      );
    } catch (error) {
      if (error instanceof InvalidResetTokenError) {
        log(requestId, 'password_reset.completed', 'denied', {
          actorRole: 'anonymous',
          targetType: 'password_reset_token',
          targetId: tokenFingerprint,
        });

        return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
      }

      throw error;
    }

    log(requestId, 'password_reset.completed', 'success', {
      actorRole: 'anonymous',
      targetType: 'password_reset_token',
      targetId: tokenFingerprint,
    });

    return NextResponse.json({ status: 'password-reset-complete' }, { status: 200 });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
