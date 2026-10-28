/**
 * `GET /api/admin/registrations` — the pending-registration queue (FR-3).
 *
 * FR-3: each entry shows the name, the email, the self-declared role, and
 * the registration timestamp. The entries are ordered by submission time.
 *
 * **Only an administrator may call this** (story 002 criterion 5).
 *
 * The list is bounded by the query's page size, so a queue that returns
 * everything — and therefore times out — cannot happen.
 */

import { NextResponse } from 'next/server';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import { log, errorResponse, readRequestId, readSessionCookie } from '@/app/api/_helpers';

export async function GET(): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();
    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor || !actor.isAdministrator) {
      log(requestId, 'account.registration_queue_read', 'denied', {
        actorId: actor?.actorId,
        actorRole: actor?.isAdministrator ? 'administrator' : 'member',
      });

      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    }

    const pending = await stack.queue.listPending();

    log(requestId, 'account.registration_queue_read', 'success', {
      actorId: actor.actorId,
      actorRole: 'administrator',
    });

    return NextResponse.json({
      registrations: pending.map(({ account }) => ({
        id: account.id,
        displayName: account.displayName.value,
        email: account.email.value,
        selfDeclaredRole: account.selfDeclaredRole.role,
        selfDeclaredRoleOther: account.selfDeclaredRole.otherText,
        registeredAt: account.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
