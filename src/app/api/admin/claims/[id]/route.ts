/**
 * `GET /api/admin/claims/[id]` — the administrator's claim review screen
 * (FR-16, story 002).
 *
 * **Only an administrator may read this.** The actor is derived from the
 * session — never from the request — so a client cannot assert its own role.
 * The screen carries the Claim's reason and identifying details, which are
 * FR-37 Sensitive Fields: this is the one place the finder is *not* a
 * viewer of them.
 *
 * **The screen is a read-only assembly.** It performs no state transition,
 * writes nothing, and opens no transaction. The decision actions are
 * separate operations with their own gate.
 *
 * **A decided Claim still answers.** An administrator following a stale link
 * must see *what happened*, not a 404 — so the screen is returned with the
 * decision actions withdrawn, and the recorded decision's status shown.
 */

import { NextResponse } from 'next/server';

import { readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { claimAdminErrorResponse, resolveAdministrator } from '../claim-admin-route-helpers';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Read the claim review screen as an administrator. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'claim.reviewed';

  try {
    const { id } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveAdministrator(requestId, action, id);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    const screen = await stack.claimReviews.review({ claimId: id });
    const offersDecision = stack.claimReviews.offersDecision(screen);

    return NextResponse.json({
      claimId: screen.claimId,
      status: screen.claimStatus,
      reason: screen.reason,
      identifyingDetails: screen.identifyingDetails,
      dateLost: screen.dateLost,
      submittedAt: screen.submittedAt.toISOString(),
      item: {
        name: screen.item.name,
        category: screen.item.category,
        date: screen.item.date,
        campusArea: screen.item.campusArea,
      },
      // **The competing claims are listed by reference.** An id and a
      // submission time are what the administrator needs to judge whether
      // the claim is contested; the competitors' own evidence is not what
      // they are being asked to judge.
      competingClaims: screen.competingClaims.map((competing) => ({
        claimId: competing.claimId,
        submittedAt: competing.submittedAt.toISOString(),
      })),
      // **The count is derived from the list,** so the two cannot disagree.
      competingClaimCount: screen.competingClaimCount,
      // **A Claim that is no longer `Pending` has no decision action.** The
      // screen still answers — it shows the recorded decision instead.
      decisionAvailable: offersDecision,
    });
  } catch (error) {
    return claimAdminErrorResponse(error, requestId, action);
  }
}
