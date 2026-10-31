/**
 * `POST /api/admin/registrations/[id]` — approve or reject a pending
 * registration (FR-3, FR-27).
 *
 * **Only an administrator may call this** (story 002 criterion 5). The check
 * is here, at the boundary, and it reads the actor from the session — the
 * `ActorContext` carries the administrator flag, so the check is one
 * property rather than a re-derivation.
 *
 * **The email is sent after the transaction commits** (ADR-3, decision 4).
 * The route runs the decision in a transaction, and only once that
 * transaction has returned does it send the approval or rejection email.
 * A send failure **does not roll back the decision**.
 */

import { NextResponse } from 'next/server';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildAccountApprovedEmail } from '@/application/accounts/account-approved-email';
import { buildAccountRejectedEmail } from '@/application/accounts/account-rejected-email';

import {
  errorResponse,
  log,
  optionalStringField,
  readCsrfToken,
  readJsonBody,
  readRequestId,
  readSessionCookie,
  stringField,
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

    // The actor comes from the session. An unauthenticated or
    // non-administrator caller is refused.
    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor || !actor.isAdministrator) {
      log(requestId, 'account.registration_reviewed', 'denied', {
        actorId: actor?.actorId,
        actorRole: actor?.isAdministrator ? 'administrator' : 'member',
        targetType: 'account',
        targetId: id,
      });

      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    }

    // A state-changing request carries a CSRF token.
    const csrfToken = await readCsrfToken();
    const csrf = stack.csrf.validate(token ? stack.tokens.hashToken(token) : null, csrfToken);

    if (!csrf.valid) {
      return NextResponse.json({ error: 'Your request could not be verified.' }, { status: 403 });
    }

    const body = await readJsonBody(request);
    const decision = stringField(body, 'decision');
    const reason = optionalStringField(body, 'reason');

    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json({ error: 'Choose whether to approve or reject.' }, { status: 422 });
    }

    // A rejection's reason must meet the PRD's 5-character minimum. The
    // **boundary** enforces it; the aggregate tolerates a missing reason.
    if (decision === 'reject' && reason !== null && reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'The reason must be at least 5 characters.', field: 'reason' },
        { status: 422 },
      );
    }

    const outcome = await stack.transactions.run((transaction) =>
      stack.review.execute(decision, id, actor.actorId, transaction, reason),
    );

    log(requestId, 'account.registration_reviewed', 'success', {
      actorId: actor.actorId,
      actorRole: 'administrator',
      targetType: 'account',
      targetId: outcome.account.id,
    });

    // The email is sent **after** the commit.
    if (decision === 'approve' && outcome.approvalEmailRecipient) {
      await sendApprovalEmail(
        stack,
        outcome.approvalEmailRecipient,
        outcome.account.displayName.value,
      );
    }

    if (decision === 'reject' && outcome.rejectionEmailRecipient) {
      await sendRejectionEmail(
        stack,
        outcome.rejectionEmailRecipient,
        outcome.account.displayName.value,
        outcome.account.rejectionReason?.value ?? null,
      );
    }

    return NextResponse.json({
      status: outcome.account.status,
      accountId: outcome.account.id,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/**
 * Send the FR-27 approval email.
 *
 * **A failure never rolls back the approval** — the decision is already
 * committed. The failure is logged, without any sensitive value.
 */
async function sendApprovalEmail(
  stack: ReturnType<typeof buildIdentityStack>,
  to: string,
  displayName: string,
): Promise<void> {
  if (!stack.email) {
    // SMTP is not configured — the case in local development (CP-4). The
    // email is verified by automated test only.
    log(crypto.randomUUID(), 'account.approved_email_not_configured', 'denied', {
      actorRole: 'system',
    });

    return;
  }

  const email = buildAccountApprovedEmail(to, {
    displayName,
    loginUrl: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/login` : '/login',
  });

  try {
    await stack.email.send(email);
  } catch {
    // The approval stands. The failure is recorded — PRD §10 requires a
    // failed background action to be recorded — and carries no sensitive
    // value: the fact of the failure, never the content.
    log(crypto.randomUUID(), 'account.approved_email_failed', 'error', {
      actorRole: 'system',
    });
  }
}

/**
 * Send the rejection email, including the administrator's reason.
 *
 * **A failure never rolls back the rejection.**
 */
async function sendRejectionEmail(
  stack: ReturnType<typeof buildIdentityStack>,
  to: string,
  displayName: string,
  reason: string | null,
): Promise<void> {
  if (!stack.email) {
    log(crypto.randomUUID(), 'account.rejected_email_not_configured', 'denied', {
      actorRole: 'system',
    });

    return;
  }

  const email = buildAccountRejectedEmail(to, { displayName, reason });

  try {
    await stack.email.send(email);

    log(crypto.randomUUID(), 'account.rejected_email_sent', 'success', {
      actorRole: 'system',
    });

    if (process.env.NODE_ENV !== 'production') {
      console.info('[findback] Rejection email sent. Open Mailpit at http://localhost:8025');
    }
  } catch {
    log(crypto.randomUUID(), 'account.rejected_email_failed', 'error', {
      actorRole: 'system',
    });
  }
}
