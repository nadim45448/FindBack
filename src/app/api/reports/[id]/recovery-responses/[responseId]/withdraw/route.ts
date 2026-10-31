/**
 * `POST /api/reports/[id]/recovery-responses/[responseId]/withdraw` — the
 * responder's withdrawal of their own Recovery Response (FR-40, event 20).
 *
 * **The route is thin.** The responder-only rule, the `Submitted`-only rule,
 * and the conditional write all live in the service and the domain. The
 * route resolves the member, validates the CSRF token, and maps the result.
 *
 * **The body is not read at all.** A withdrawal names one response, and the
 * response's id is in the URL. A client cannot redirect the withdrawal at
 * another response by putting a different id in a body — there is no body.
 *
 * **The route is `POST`, not `DELETE`.** A withdrawal is not a deletion: the
 * response and its history are preserved (PRD §10), and the response leaves
 * the active set rather than ceasing to exist. A `POST` says "perform this
 * transition", which is what it is.
 *
 * **The response carries no Sensitive Field.** It returns the response's id,
 * the status it reached, and whether anything was written — the facts the
 * responder's screen needs to refresh itself.
 *
 * **A missing response is a 403, never a 404.** The response's existence is
 * a private fact about another member's assertion, and the route cannot
 * answer "that response is not real" to a stranger.
 */

import { NextResponse } from 'next/server';

import { log, readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import {
  recoveryResponseErrorResponse,
  refuseRecoveryResponseWithoutCsrf,
  resolveRecoveryResponseMember,
  type RecoveryResponseRouteContext,
} from '../recovery-response-route-helpers';

/** Withdraw a Recovery Response. */
export async function POST(
  request: Request,
  context: RecoveryResponseRouteContext,
): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'recovery_response.withdrawn_by_responder';

  try {
    const { responseId } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveRecoveryResponseMember(requestId, action, responseId);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    //
    // **A state-changing request carries one.** The check comes after the
    // authorisation and before the body is read — a request from someone who
    // may not withdraw has no state to protect.
    const csrfRefusal = await refuseRecoveryResponseWithoutCsrf(
      requestId,
      action,
      responseId,
      actor.actorId,
      actor.isAdministrator ? 'administrator' : 'member',
    );

    if (csrfRefusal) {
      return csrfRefusal;
    }

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    const result = await stack.recoveryResponseWithdrawals.withdraw({
      responseId,
      actor: {
        actorId: actor.actorId,
        // **The capability is the account's state, resolved once** at the
        // `ActorContext` boundary and carried across by the shared helper.
        // A deactivated responder may not withdraw (FR-5).
        isAccountActive: actor.isAccountActive,
      },
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: 'member',
      targetType: 'recovery-response',
      targetId: result.responseId,
    });

    return NextResponse.json({
      id: result.responseId,
      status: result.status,
    });
  } catch (error) {
    return recoveryResponseErrorResponse(error, requestId, action);
  }
}
