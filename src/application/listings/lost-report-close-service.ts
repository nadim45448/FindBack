/**
 * The `LostReportCloseService` — FR-21's Lost-side closure.
 *
 * **The Lost half of the administrator's close, and it is a different
 * operation from the Found half.** The Found-side close
 * (`report-close-service.ts`) auto-rejects the report's **Pending Claims**;
 * this one resolves the report's **non-terminal Recovery Responses**. The
 * two touch different tables, resolve different records, and are recorded
 * under different catalog events — FR-31 event 10 and FR-48 event 24.
 *
 * The Found-side service refuses a Lost report outright, and this one
 * refuses a Found report. **Neither can close the other's reports**, because
 * a close that resolved the wrong dependent records would leave the report
 * `Closed` with live claimants or live responders attached to it.
 *
 * ## Two routes, one service
 *
 * **The route is decided by the report's own responses, not by the client.**
 * A response at `Match Confirmed` means the owner has determined the
 * candidate is theirs and the handoff is pending — closing the report then
 * is an *exceptional cancellation* (FR-48 event 25), not an ordinary close
 * (event 24). The distinction is read from the database, so a client cannot
 * choose which audit event its report receives.
 *
 * ## No email reaches any responder
 *
 * **FR-30 is explicit:** "No closure email to responders or claimants when a
 * report transitions to `Closed` (administrator moderation or reporter
 * withdrawal). Closure is observed by the affected parties when they next
 * visit the report or thread."
 *
 * This service sends nothing at all. There is no FR-46 event for a closure,
 * and there is no FR-29 email for it either — the claim-rejection email
 * belongs to the Found side, where a Claim is auto-rejected, and a Lost
 * report has no Claims.
 *
 * **The absence is structural rather than a matter of care.** The service
 * takes no `EmailSender` at all, so it *cannot* send a closure email; a
 * future edit that wanted to add one would have to change the constructor
 * before it could.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import { decideLostClosure, type LostClosureRoute } from '@/domain/recovery';

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

import type {
  LostCloseoutSubject,
  LostReportCloseoutReader,
} from './ports/lost-report-closeout-reader';
import type {
  LostReportCloseoutRepository,
  ResolvedResponseRecord,
} from './ports/lost-report-closeout-repository';

/** The administrator closing the report. */
export interface LostCloseActor {
  readonly actorId: string;
  /** Whether the actor is an administrator. */
  readonly isAdministrator: boolean;
}

/** What the caller supplies. */
export interface CloseLostReportRequest {
  readonly reportId: string;
  readonly actor: LostCloseActor;
  /** The administrator's reason. 10–500 characters. */
  readonly reason: string;
}

/** What a close produced. */
export interface CloseLostReportResult {
  readonly reportId: string;
  /** The status it reached. Always `Closed`. */
  readonly status: 'Closed';
  /** Which of the two closure routes this close took. */
  readonly route: LostClosureRoute;
  /** The responses the close resolved. */
  readonly resolved: readonly ResolvedResponseRecord[];
  /** The audit event's id. */
  readonly eventId: string;
}

/**
 * Closes Lost reports.
 */
export class LostReportCloseService {
  constructor(
    private readonly subjects: LostReportCloseoutReader,
    private readonly closeouts: LostReportCloseoutRepository,
    private readonly events: LostSideEventFactory,
    private readonly transactions: TransactionFactory,
  ) {}

  /**
   * Close a Lost report as an administrator.
   *
   * @throws {NotFoundError} when no report carries that id. Nothing is
   * written.
   * @throws {PermissionDeniedError} when the actor is not an administrator.
   * Nothing is written.
   * @throws {ValidationError} when the reason breaks its bound. Nothing is
   * written.
   * @throws {ConflictError} when the report is terminal or is not a Lost
   * report. Nothing is written.
   */
  async close(request: CloseLostReportRequest): Promise<CloseLostReportResult> {
    // ── The authorisation ─────────────────────────────────────────────────
    //
    // **The administrator flag comes from the session, never from the
    // request.**
    if (!request.actor.isAdministrator) {
      throw new PermissionDeniedError('You do not have access to this.');
    }

    // ── The report's facts ─────────────────────────────────────────────────
    const subject = await this.subjects.readLostCloseoutSubject(request.reportId);

    if (!subject) {
      throw new NotFoundError('No report with that id.');
    }

    // ── The decision ───────────────────────────────────────────────────────
    //
    // **The domain decides the route.** The service supplies the facts and
    // acts on the verdict; it does not write its own rule. The domain owns
    // the terminal check, the reason's bound, and — the consequential one —
    // which of the two closure routes the report takes.
    const decision = decideLostClosure({
      reportId: subject.id,
      actingAdministratorId: request.actor.actorId,
      reportStatus: subject.status,
      responses: subject.responses.map((response) => ({
        id: response.id,
        status: response.status,
      })),
      reason: request.reason,
    });

    if (decision.kind === 'Refused') {
      throw new ConflictError(
        decision.reason === 'TerminalReport'
          ? 'This report is closed or returned, so it cannot be closed again.'
          : 'This report cannot be closed this way.',
      );
    }

    // ── The write, in one transaction ─────────────────────────────────────
    //
    // **The report's status and its responses' resolution are one act.** A
    // report that is `Closed` with live responders attached to it would leave
    // the two disagreeing — and a responder waiting on a response that will
    // never resolve could never learn that the workflow ended.
    const written = await this.transactions.run((transaction) =>
      this.write(decision, subject, transaction),
    );

    return {
      reportId: subject.id,
      status: 'Closed',
      route: decision.route,
      resolved: written.resolved,
      eventId: written.eventId,
    };
  }

  /**
   * The close's write, inside the caller's transaction.
   */
  private async write(
    decision: {
      readonly reportId: string;
      readonly actingAdministratorId: string;
      readonly route: LostClosureRoute;
      readonly reason: { readonly value: string };
      readonly matchedResponses: readonly {
        readonly responseId: string;
        readonly status: string;
      }[];
    },
    subject: LostCloseoutSubject,
    transaction: TransactionHandle,
  ): Promise<{
    readonly resolved: readonly ResolvedResponseRecord[];
    readonly eventId: string;
  }> {
    // ── The report and its responses ──────────────────────────────────────
    //
    // **The batch's set is the implementation's to obtain** (ADR-10), and the
    // implementation returns exactly the rows its `UPDATE … RETURNING`
    // affected.
    const resolved = await this.closeouts.closeLostReport(
      decision.reportId,
      transaction,
    );

    if (resolved === null) {
      // **The report was closed or confirmed while we were closing.** The
      // write did not land, so nothing else is written.
      throw new ConflictError(
        'This report was already closed by someone else.',
      );
    }

    // ── The audit event ────────────────────────────────────────────────────
    //
    // **The route chooses the event.** An ordinary close writes FR-48 event
    // 24; an exceptional cancellation writes event 25. Both are written
    // inside the transaction, so the trail cannot record a closure that did
    // not commit.
    const batch = resolved.map((response) => ({
      recoveryResponseId: response.id,
      previousStatus: response.previousStatus,
    }));

    if (decision.route === 'ExceptionalCancellation') {
      // **The prior selected response is named.** Event 25 records "prior
      // selected response ID with its status at close time", and the status
      // is the `Match Confirmed` that made this close exceptional.
      //
      // **The route and the set cannot disagree.** The domain takes the
      // exceptional route only when a response is at `Match Confirmed`, so
      // the set is non-empty here — and the refusal to proceed without one
      // is the assertion of that.
      const prior = decision.matchedResponses[0];

      if (prior === undefined) {
        throw new ConflictError(
          'This report cannot be closed this way.',
        );
      }

      // **The route's event is written; its id is not returned.** Both events
      // are in the trail; the one that describes the *resolution* is event
      // 27, and that is the one the caller is told about.
      await this.events.recordExceptionalCancellation(
        {
          lostReportId: decision.reportId,
          actingAdministratorId: decision.actingAdministratorId,
          exceptionalReason: decision.reason.value,
          priorLostStatus: 'Verification Pending',
          priorSelectedResponseId: prior.responseId,
          priorSelectedResponseStatus: 'Match Confirmed',
        },
        transaction,
      );
    } else {
      await this.events.recordAdministratorClosed(
        {
          lostReportId: decision.reportId,
          actingAdministratorId: decision.actingAdministratorId,
          reason: decision.reason.value,
          priorLostStatus: subject.status === 'Open' ? 'Open' : 'Verification Pending',
        },
        transaction,
      );
    }

    // ── The batch resolution event ────────────────────────────────────────
    //
    // **Event 27 covers every closure route** — the reporter's withdrawal,
    // the administrator's normal closure, and the exceptional cancellation.
    // The resolution is one operation, whatever caused it, so it is one
    // event.
    const closeout = await this.events.recordClosedCloseout(
      {
        lostReportId: decision.reportId,
        cause: {
          actingAdministratorId: decision.actingAdministratorId,
          actingMemberId: null,
          triggeredByRole: 'administrator',
        },
        resolvedResponses: batch,
      },
      transaction,
    );

    // **The batch event's id is the result's event id.** The route wrote
    // event 24 or event 25 as well, and the trail holds all three — but the
    // event that describes *the resolution* is event 27, and that is the one
    // the caller is told about. **The route's own event id is not returned
    // as a fallback:** both are always written, so there is nothing to fall
    // back from.
    return { resolved, eventId: closeout.id };
  }
}
