/**
 * `POST /api/admin/accounts/[id]/deactivate` — deactivate an account (FR-5).
 *
 * **Only an administrator may call this** (story 004 criterion 6). The actor
 * is derived from the session — never from the request body — so a client
 * cannot assert its own role.
 *
 * **There is no "refuse to deactivate an administrator" branch.** Per the
 * owner's decision and PRD FR-5, the target's administrator flag confers no
 * protection: any administrator may deactivate any `Active` account,
 * including another administrator, and the target's flag is cleared on
 * deactivation so no stale privilege survives.
 *
 * **The only precondition on the target is that it is `Active`** — and that
 * check lives in the aggregate, so the route does not repeat it.
 *
 * **An already-`Deactivated` target is a 200 with the same body**, not a
 * 409. A second deactivation is the same request arriving twice, not a
 * conflict, and it writes nothing and records nothing (story 004's edge
 * case).
 *
 * **The status change and every session revocation commit together**
 * (ADR-3), so there is never a window in which a deactivated account holds
 * a live session.
 */

import { NextResponse } from 'next/server';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import {
  errorResponse,
  log,
  readCsrfToken,
  readRequestId,
  readSessionCookie,
} from '@/app/api/_helpers';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();
    const { id } = await context.params;

    // The actor comes from the session.
    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor || !actor.isAdministrator) {
      log(requestId, 'account.deactivated', 'denied', {
        actorId: actor?.actorId,
        actorRole: actor?.isAdministrator ? 'administrator' : 'member',
        targetType: 'account',
        targetId: id,
      });

      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    }

    // A state-changing request carries a CSRF token.
    const csrfToken = await readCsrfToken();
    const csrf = stack.csrf.validate(
      token ? stack.tokens.hashToken(token) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      return NextResponse.json({ error: 'Your request could not be verified.' }, { status: 403 });
    }

    const outcome = await stack.transactions.run((transaction) =>
      stack.deactivation.execute(id, actor.actorId, transaction),
    );

    log(requestId, 'account.deactivated', 'success', {
      actorId: actor.actorId,
      actorRole: 'administrator',
      targetType: 'account',
      targetId: outcome.account.id,
    });

    // The idempotent no-op returns the **same body** as a success — a
    // repeated request is not an error.
    return NextResponse.json({
      status: 'deactivated',
      accountId: outcome.account.id,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
