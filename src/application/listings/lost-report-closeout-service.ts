/**
 * The `LostReportCloseoutService` — FR-45's atomic Lost-side closeout.
 *
 * **This is the Lost half of the Returned transition, and it is a separate
 * service from the Found-side one.** Bolt `019` built the *confirmation* —
 * the report's move and the record of who received the item. This service
 * builds what the PRD calls the *closeout*: the responses' resolution, the
 * threads' read-only state, and the two notifications that fire with it.
 *
 * ## The two are one transaction, and that is the point
 *
 * FR-45's closeout and FR-23's confirmation write the same report's status.
 * **They are not two transactions, and they are not two services racing.**
 * The confirmation's transaction moves the report to `Returned`; the
 * closeout's transaction resolves the responses. If those were separate, a
 * report could be `Returned` with its matched response still at
 * `Match Confirmed` — a report that says the item came home while the
 * response that proved it is still in play.
 *
 * **So the closeout runs inside the confirmation's transaction.** The
 * confirmation service opens the transaction; the closeout joins it. The
 * report's move, the responses' resolution, the audit events, and the
 * notifications' preparation are one act.
 *
 * ## The sequence is the mechanism
 *
 * ```text
 * 1.  read the report's closeout facts  → the owner, the responses, the selection
 * 2.  decide the closeout                → planned | refused
 * 3.  BEGIN
 * 4.    UPDATE reports (conditional)       → the report reaches Returned
 * 5.    UPDATE responses (matched)         → Completed — Report Returned
 * 6.    UPDATE responses (batch)            → Resolved — Report Returned
 * 7.    UPDATE threads                      → read-only
 * 8.    INSERT audit_events (26, 30)        → the resolution
 * 9.  COMMIT
 * 10.   send events 7 and 8                 → after the commit
 * ```
 *
 * **The notifications are strictly post-commit.** ADR-3's decision 4 and
 * PRD §10 both require it: a send failure must not roll back or block the
 * transition, and an email sent inside the transaction could reach a
 * recipient whose report then failed to commit.
 *
 * **The event-8 gate is enforced here and in the domain.** The domain's gate
 * requires `Completed — Report Returned` *and* report `Returned`; by the
 * time the notifications are prepared, the transaction has committed and
 * both hold. The gate is still evaluated rather than assumed, because a
 * service that assumed its own precondition would not notice a caller that
 * skipped the closeout.
 *
 * **A responder with no address receives nothing, and the transition still
 * stands.** The story's edge case is explicit: *"Deactivated matched
 * responder — event 8 is skipped, the transition still commits."* A
 * deactivated account has no deliverable address, and a message that cannot
 * be delivered is not a reason to un-return a report whose owner has the
 * item in hand.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { EmailSender } from '@/application/ports/email-sender';

import {
  decideLostReturnedCloseout,
  type LostReturnedCloseoutPlan,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import {
  decideNotification,
  type LostSideNotificationEvent,
} from '@/domain/notifications';

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

import type { LostSideNotificationDispatcher } from '@/application/notifications/lost-side-notification-dispatcher';

import type {
  LostCloseoutSubject,
  LostReportCloseoutReader,
} from './ports/lost-report-closeout-reader';
import type {
  LostReportCloseoutRepository,
  ResolvedResponseRecord,
} from './ports/lost-report-closeout-repository';

/** The administrator confirming the return. */
export interface LostCloseoutActor {
  readonly actorId: string;
  /**
   * Whether the actor is an administrator.
   *
   * **The Lost-side closeout is an administrator's act** (FR-45). The flag
   * comes from the session; the route resolves it and the service checks it,
   * so a client cannot assert its own role — and the Lost-report owner, who
   * *is* the default receiver, still cannot close their own report.
   */
  readonly isAdministrator: boolean;
}

/** What the caller supplies. */
export interface CompleteLostCloseoutRequest {
  readonly reportId: string;
  readonly actor: LostCloseoutActor;
}

/** What the closeout produced. */
export interface CompleteLostCloseoutResult {
  readonly reportId: string;
  /** The report's status after the closeout. Always `Returned`. */
  readonly status: 'Returned';
  /** The matched response's id — the one that completed. */
  readonly matchedResponseId: string;
  /** The responses the batch resolved. */
  readonly resolved: readonly ResolvedResponseRecord[];
  /** The responses left alone because they were already terminal. */
  readonly untouched: readonly {
    readonly responseId: string;
    readonly status: string;
  }[];
  /**
   * The notifications that were sent.
   *
   * **Only the events that actually fired.** A responder with no deliverable
   * address has no entry, and a skipped event 8 is absent rather than
   * recorded as a failure.
   */
  readonly notifications: readonly { readonly event: LostSideNotificationEvent; readonly sent: boolean }[];
}

/**
 * Performs the Lost-side Returned closeout.
 */
export class LostReportCloseoutService {
  constructor(
    private readonly subjects: LostReportCloseoutReader,
    private readonly closeouts: LostReportCloseoutRepository,
    private readonly events: LostSideEventFactory,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly notifications: LostSideNotificationDispatcher,
    private readonly emails: EmailSender,
  ) {}

  /**
   * Complete the Lost-side Returned closeout.
   *
   * **The confirmation's transaction is the closeout's transaction.** The
   * caller opens it — or the closeout opens it when called on its own — and
   * every write below lands inside it.
   *
   * @throws {NotFoundError} when no report carries that id. Nothing is
   * written.
   * @throws {PermissionDeniedError} when the actor is not an administrator.
   * Nothing is written.
   * @throws {ConflictError} when the report or its matched response refuses
   * the closeout. Nothing is written.
   */
  async complete(
    request: CompleteLostCloseoutRequest,
    transaction?: TransactionHandle,
    /**
     * Whether the report has **already** been moved to `Returned` in this
     * transaction.
     *
     * **The confirmation service shares the transaction and has already made
     * the move.** The closeout's job in that case is the responses'
     * resolution alone; its own conditional write would match no rows and be
     * reported as a lost race — a false conflict for a transition that is
     * succeeding.
     */
    reportAlreadyReturned = false,
  ): Promise<CompleteLostCloseoutResult> {
    // ── 1. The authorisation ───────────────────────────────────────────────
    //
    // **The administrator flag comes from the session, never from the
    // request.** The route resolves the actor; the service decides. A
    // client that could assert its own role would be choosing which
    // administrator's name the trail records.
    if (!request.actor.isAdministrator) {
      throw new PermissionDeniedError('You do not have access to this.');
    }

    // ── 2. The report's closeout facts ─────────────────────────────────────
    const subject = await this.subjects.readLostCloseoutSubject(
      request.reportId,
      transaction,
    );

    if (!subject) {
      throw new NotFoundError('No report with that id.');
    }

    // ── 3. The decision ────────────────────────────────────────────────────
    //
    // **The domain decides.** The service supplies the facts and acts on the
    // verdict; it does not write its own rule. The domain owns which
    // response is matched, which responses are resolved, which are left
    // alone, and when the whole thing is refused.
    const plan = this.plan(subject, request.actor.actorId);

    if (plan.kind === 'Refused') {
      throw new ConflictError(
        plan.reason === 'NoMatchedResponse'
          ? 'This report has no matched recovery response to complete.'
          : 'This report cannot be completed as returned.',
      );
    }

    // ── 4. The write, in one transaction ───────────────────────────────────
    //
    // **The report's move, the responses' resolution, and the events are one
    // act.** When the caller supplied a transaction, the closeout joins it;
    // when it did not, the closeout opens one.
    const written = transaction
      ? await this.write(plan, subject, transaction, reportAlreadyReturned)
      : await this.transactions.run((handle) =>
          this.write(plan, subject, handle, reportAlreadyReturned),
        );

    // ── 5. The notifications, after the commit ─────────────────────────────
    //
    // **Strictly post-commit.** A send failure never rolls back or blocks
    // the transition.
    const notifications = await this.notify(
      plan,
      subject,
      written.matchedResponseId,
      written.matchedStatus,
    );

    return {
      reportId: plan.reportId,
      status: 'Returned',
      matchedResponseId: written.matchedResponseId,
      resolved: written.resolved,
      untouched: plan.untouched,
      notifications,
    };
  }

  /**
   * The domain's decision, and the refusals it produces.
   */
  private plan(
    subject: LostCloseoutSubject,
    actingAdministratorId: string,
  ): LostReturnedCloseoutPlan | { readonly kind: 'Refused'; readonly reason: string } {
    // **A report with no selected response has no matched response.** The
    // matched response is the one the owner selected, and the closeout names
    // it explicitly — it is never inferred from the set.
    if (subject.selectedResponseId === null) {
      return { kind: 'Refused', reason: 'NoMatchedResponse' };
    }

    return decideLostReturnedCloseout({
      reportId: subject.id,
      actingAdministratorId,
      ownerId: subject.ownerId,
      matchedResponseId: subject.selectedResponseId,
      responses: subject.responses.map((response) => ({
        id: response.id,
        status: response.status,
      })),
    });
  }

  /**
   * The closeout's writes — the report's move, the responses' resolution,
   * and the audit events — inside the caller's transaction.
   */
  private async write(
    plan: LostReturnedCloseoutPlan,
    subject: LostCloseoutSubject,
    transaction: TransactionHandle,
    reportAlreadyReturned: boolean,
  ): Promise<{
    readonly matchedResponseId: string;
    readonly resolved: readonly ResolvedResponseRecord[];
    /**
     * The matched response's status **after** the write.
     *
     * **Read from what the write produced, not from what the subject said
     * before it.** The subject was read before the write, and it carried the
     * matched response at `Match Confirmed` — which is the *prior* status,
     * and event 8's gate would refuse it. The gate is meant to be evaluated
     * against the completed handoff, so the value that satisfies it is the
     * one the write produced.
     */
    readonly matchedStatus: RecoveryResponseStatus;
  }> {
    // ── The report's move and the responses' resolution ───────────────────
    //
    // **The batch's set is the implementation's to obtain** (ADR-10), and the
    // implementation returns exactly the rows its `UPDATE … RETURNING`
    // affected. The domain's plan says which response is matched; the
    // statement says which non-terminal rows to resolve.
    const resolved = await this.closeouts.confirmLostReturned(
      plan.reportId,
      plan.matched.responseId,
      reportAlreadyReturned,
      transaction,
    );

    if (resolved === null) {
      // **The report was closed or confirmed while we were confirming.** The
      // write did not land, so nothing else is written and the transaction
      // rolls back with the conflict.
      throw new ConflictError(
        'This report was already confirmed as returned by someone else.',
      );
    }

    // ── The audit events ───────────────────────────────────────────────────
    //
    // **Events 26 and 30, together.** Event 26 is the batch — every
    // non-selected non-terminal response the update resolved — and event 30
    // is the matched response individually. The factory writes both or
    // neither, so the PRD's requirement that they exist together is
    // structural rather than a convention.
    const batch = resolved.map((response) => ({
      recoveryResponseId: response.id,
      previousStatus: response.previousStatus,
    }));

    await this.events.recordReturnedCloseout(
      {
        lostReportId: plan.reportId,
        actingAdministratorId: plan.actingAdministratorId,
        resolvedResponses: batch,
        matchedResponseId: plan.matched.responseId,
      },
      transaction,
    );

    return {
      matchedResponseId: plan.matched.responseId,
      resolved,
      matchedStatus: plan.matched.targetStatus,
    };
  }

  /**
   * Send events 7 and 8 — after the commit.
   *
   * **The gate is evaluated, not assumed.** By the time this runs the
   * transaction has committed and both conditions hold, but a service that
   * assumed its own precondition would not notice a caller that skipped the
   * closeout — and the gate is the PRD's most consequential rule.
   */
  private async notify(
    plan: LostReturnedCloseoutPlan,
    subject: LostCloseoutSubject,
    matchedResponseId: string,
    matchedStatus: RecoveryResponseStatus,
  ): Promise<readonly { readonly event: LostSideNotificationEvent; readonly sent: boolean }[]> {
    const sent: { event: LostSideNotificationEvent; sent: boolean }[] = [];

    // ── Event 7 — the Lost-report owner ────────────────────────────────────
    //
    // **The owner is told their item came home.** The gate does not constrain
    // event 7 beyond the report's own reach — the report being `Returned` is
    // its trigger.
    const ownerDecision = decideNotification({
      event: 'lost_report_returned',
      reportStatus: 'Returned',
      responseStatus: null,
    });

    if (ownerDecision.kind === 'Permitted' && subject.ownerEmail) {
      const sentOk = await this.notifications.dispatch({
        event: 'lost_report_returned',
        recipientId: subject.ownerId,
        recipientEmail: subject.ownerEmail,
        reportId: plan.reportId,
        responseId: null,
        itemName: subject.name,
      });

      sent.push({ event: 'lost_report_returned', sent: sentOk });
    } else {
      sent.push({ event: 'lost_report_returned', sent: false });
    }

    // ── Event 8 — the matched responder ────────────────────────────────────
    //
    // **The gate is the PRD's conjunction:** the response is `Completed —
    // Report Returned` and the report is `Returned`. The matched response's
    // status is read from what the write produced, not from what the plan
    // hoped for — the subject carried the *prior* status, and evaluating the
    // gate against that would refuse the very event the closeout exists to
    // fire.
    const matched = subject.responses.find((response) => response.id === matchedResponseId);

    const responderDecision = decideNotification({
      event: 'recovery_completed',
      reportStatus: 'Returned',
      responseStatus: matchedStatus,
    });

    if (responderDecision.kind === 'Permitted' && matched?.responderEmail) {
      const sentOk = await this.notifications.dispatch({
        event: 'recovery_completed',
        recipientId: matched.id,
        recipientEmail: matched.responderEmail,
        reportId: plan.reportId,
        responseId: matched.id,
        itemName: subject.name,
      });

      sent.push({ event: 'recovery_completed', sent: sentOk });
    } else {
      sent.push({ event: 'recovery_completed', sent: false });
    }

    return sent;
  }
}
