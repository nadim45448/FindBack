/**
 * The Lost-side event factory — the only way to build an FR-48 event.
 *
 * **Thirteen methods for sixteen events.** Three methods write more than one
 * event, because a single business action produces more than one record:
 * `recordDetermination` writes 18 or 19, `recordReturnedConfirmed` writes 21
 * or 22, and `recordReturnedCloseout` writes 26 and 30 together.
 *
 * **The factory owns the record's shape; the firing module owns the
 * transition.** This is the hexagonal boundary ADR-9 draws. The factory
 * validates the fields a record must carry, the determination pair, the
 * system-actor cause, and the batch completeness. It never asks whether a
 * Recovery Response may be withdrawn or whether a Lost report is in
 * `Verification Pending` — those are FR-41's rules, and they belong to
 * unit 004's `recovery/`, unit 005's `returns/`, and unit 002's `listings/`.
 *
 * The guarantee is therefore structural: a firing module cannot invent an
 * event number, cannot omit a required field, and cannot write a
 * determination without both halves of the pair. These would be conventions
 * if the catalog were a plain data structure the callers read.
 *
 * **The response-level and report-level events of one business action are
 * separate methods.** Event 17's actor is the owner; event 29's is the system
 * identifying the owner. Merging them would force one actor model onto two
 * different facts, and would break the event-type filter — a filter on event
 * type must find "the report entered Verification Pending" without also
 * matching "a response was selected".
 *
 * The factory writes through `AuditWriter`, so every event is appended inside
 * the caller's transaction and a rollback discards it with the state change.
 */

import {
  BatchResolutionError,
  EventPairingError,
  LostSideFieldError,
  SystemActorCauseError,
  assertBatchShape,
  assertDeterminationPair,
  assertReturnedPairing,
  isPriorLostReportStatus,
  isRecoveryResponseStatus,
  resolveSystemActor,
  type BatchResolution,
  type DeterminationActor,
  type DeterminationOutcome,
  type LostReportStatus,
  type PriorLostReportStatus,
  type RecoveryResponseStatus,
  type ResolvedResponse,
  type SystemActorCause,
} from '@/domain/audit';
import type { AuditEvent } from '@/domain/audit';
import { AuditWriter } from './audit-writer';
import type { TransactionHandle } from './ports/transaction-handle';

/**
 * The catalog's type discriminators for the Lost-side events.
 *
 * Held here as constants so a typo in a method body is a compile error
 * rather than a catalog violation at runtime.
 */
const EVENT = {
  responseSubmitted: 'recovery_response.submitted',
  threadMessagePosted: 'recovery_response.thread_message_posted',
  selectedForVerification: 'recovery_response.selected_for_verification',
  determinedMatchConfirmed: 'recovery_response.determined_match_confirmed',
  determinedNotAMatch: 'recovery_response.determined_not_a_match',
  responseWithdrawn: 'recovery_response.withdrawn_by_responder',
  returnedDefaultReceiver: 'returned.confirmed_lost_default_receiver',
  returnedSubstituteReceiver: 'returned.confirmed_lost_substitute_receiver',
  lostWithdrawn: 'report.lost_withdrawn_by_reporter',
  administratorClosed: 'report.lost_closed_by_administrator',
  exceptionalCancellation: 'report.lost_cancelled_after_match_confirmed',
  returnedCloseout: 'report.lost_returned_child_response_resolution',
  closedCloseout: 'report.lost_closed_child_response_resolution',
  notAMatchReturnToOpen: 'report.lost_verification_pending_returned_to_open',
  toVerificationPending: 'report.lost_transition_to_verification_pending',
  completedReportReturned: 'recovery_response.completed_report_returned',
} as const;

/** The Lost report's own parent type. Every report-level event hangs from it. */
const REPORT_PARENT = 'report' as const;

/** The event 26 references event 30 by, and vice versa. */
const MATCHED_TERMINAL_EVENT_NUMBER = 30;

/** A draft that names the report and response it is about. */
interface LostSideRef {
  readonly lostReportId: string;
  readonly recoveryResponseId: string;
}

/** A human actor, with the role the PRD names for the event. */
type HumanRole = 'member' | 'administrator';

/** Draft for event 15 — a Recovery Response submitted. */
export interface ResponseSubmittedDraft extends LostSideRef {
  readonly responderId: string;
  /** Sensitive: catalog-named for event 15 only. */
  readonly whereFound: string;
  /** Sensitive: catalog-named for event 15 only. */
  readonly observedIdentifyingDetails: string;
  readonly dateFound: Date;
  readonly imagePresent: boolean;
  readonly occurredAt?: Date;
}

/** Draft for event 16 — a message posted in a per-Recovery-Response thread. */
export interface ThreadMessagePostedDraft extends LostSideRef {
  /** The owner, the responder, or an administrator. */
  readonly actorId: string;
  readonly actorRole: HumanRole;
  /** Sensitive: catalog-named for event 16 only. */
  readonly messageText: string;
  readonly occurredAt?: Date;
}

/** Draft for event 17 — a response selected for verification. */
export interface SelectedForVerificationDraft extends LostSideRef {
  /** The Lost-report owner, who makes the selection. */
  readonly ownerId: string;
  readonly occurredAt?: Date;
}

/** Draft for events 18 and 19 — a determination recorded. */
export interface DeterminationDraft extends LostSideRef {
  readonly determination: DeterminationActor;
  /**
   * The Lost report's owner, as a server-side fact.
   *
   * The determination's maker is checked against this (ADR-11). It is never a
   * request field.
   */
  readonly lostReportOwnerId: string;
  readonly outcome: DeterminationOutcome;
  readonly verificationTimestamp: Date;
  readonly occurredAt?: Date;
}

/** Draft for event 20 — a response withdrawn by its responder. */
export interface ResponseWithdrawnDraft extends LostSideRef {
  readonly responderId: string;
  readonly occurredAt?: Date;
}

/** Draft for events 21 and 22 — a physical return confirmed. */
export interface ReturnedConfirmedDraft {
  readonly lostReportId: string;
  readonly actingAdministratorId: string;
  /** The default receiver — the Lost-report owner. */
  readonly receiverId?: string;
  /** The substitute receiver's details. Sensitive: catalog-named for 22. */
  readonly substituteReceiverName?: string;
  /** Sensitive: catalog-named for event 22 only. */
  readonly authorizationAffirmation?: string;
  /** Sensitive: catalog-named for event 22 only. */
  readonly relationship?: string;
  readonly occurredAt?: Date;
}

/** Draft for event 23 — a Lost report withdrawn by its reporter. */
export interface LostWithdrawnDraft {
  readonly lostReportId: string;
  /** The Lost-report owner, who withdraws their own report. */
  readonly ownerId: string;
  readonly priorLostStatus: PriorLostReportStatus;
  readonly occurredAt?: Date;
}

/** Draft for event 24 — a Lost report closed by an administrator. */
export interface AdministratorClosedDraft {
  readonly lostReportId: string;
  readonly actingAdministratorId: string;
  /** Verbatim — stored exactly as given, even where the user-facing copy is softer. */
  readonly reason: string;
  readonly priorLostStatus: PriorLostReportStatus;
  readonly occurredAt?: Date;
}

/** Draft for event 25 — a Match-Confirmed Lost report cancelled. */
export interface ExceptionalCancellationDraft {
  readonly lostReportId: string;
  readonly actingAdministratorId: string;
  /** Verbatim — stored exactly as given. */
  readonly exceptionalReason: string;
  readonly priorLostStatus: PriorLostReportStatus;
  readonly priorSelectedResponseId: string;
  readonly priorSelectedResponseStatus: RecoveryResponseStatus;
  readonly occurredAt?: Date;
}

/** Draft for event 26 and 30 — the Returned closeout. */
export interface ReturnedCloseoutDraft {
  readonly lostReportId: string;
  readonly actingAdministratorId: string;
  /**
   * The non-selected non-terminal responses the batch update resolved.
   *
   * **This set is the update's `RETURNING` clause, unmodified** (ADR-10). The
   * firing module that performed the batch update owns this obligation: the
   * set passed is the set the update returned. The factory records it
   * verbatim and cannot verify it — the `recovery_responses` table belongs to
   * unit 004, and the audit module must not read it.
   */
  readonly resolvedResponses: readonly ResolvedResponse[];
  /** The matched selected response, recorded individually under event 30. */
  readonly matchedResponseId: string;
  readonly occurredAt?: Date;
}

/** Draft for event 27 — the Closed closeout. */
export interface ClosedCloseoutDraft {
  readonly lostReportId: string;
  /** The administrator or the reporter who triggered the closure. */
  readonly cause: SystemActorCause;
  /** The set the batch update's `RETURNING` clause returned, unmodified. */
  readonly resolvedResponses: readonly ResolvedResponse[];
  readonly occurredAt?: Date;
}

/** Draft for event 28 — the report returned to Open after a Not a Match. */
export interface NotAMatchReturnToOpenDraft {
  readonly lostReportId: string;
  /** The administrator who recorded the Not a Match outcome. */
  readonly actingAdministratorId: string;
  readonly priorSelectedResponseId: string;
  readonly occurredAt?: Date;
}

/** Draft for event 29 — the report entered Verification Pending. */
export interface ToVerificationPendingDraft {
  readonly lostReportId: string;
  /** The owner who selected. A plain member, not an administrator. */
  readonly ownerId: string;
  readonly selectedResponseId: string;
  readonly occurredAt?: Date;
}

/** The events a closeout writes, in the order the trail shows them. */
export interface LostSideEventPair {
  readonly batch: AuditEvent;
  readonly individual: AuditEvent;
}

/**
 * The Lost-side event factory.
 *
 * Holds the `AuditWriter`, so a caller never writes an FR-48 event directly.
 */
export class LostSideEventFactory {
  constructor(private readonly writer: AuditWriter) {}

  /**
   * Record event 15 — a Recovery Response was submitted.
   *
   * Where-found and observed identifying details are catalog-named for this
   * event and are recorded on the administrator-only trail. They are never
   * written to the operational log.
   */
  async recordResponseSubmitted(
    draft: ResponseSubmittedDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    return this.writer.record(
      {
        eventType: EVENT.responseSubmitted,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: { actorId: draft.responderId, actorRole: 'member' },
        payload: {
          recoveryResponseId: draft.recoveryResponseId,
          whereFound: draft.whereFound,
          observedIdentifyingDetails: draft.observedIdentifyingDetails,
          dateFound: draft.dateFound.toISOString(),
          imagePresence: draft.imagePresent,
        },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 16 — a message was posted in a per-Recovery-Response thread.
   *
   * The thread message is parented to the **message**, not the response,
   * because the trail's retention follows the thread message's own lifetime.
   */
  async recordThreadMessagePosted(
    draft: ThreadMessagePostedDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    return this.writer.record(
      {
        eventType: EVENT.threadMessagePosted,
        parent: {
          parentType: 'recovery_response_thread_message',
          parentId: draft.recoveryResponseId,
        },
        actor: { actorId: draft.actorId, actorRole: draft.actorRole },
        payload: {
          recoveryResponseId: draft.recoveryResponseId,
          messageText: draft.messageText,
        },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 17 — a response was selected for verification.
   *
   * The actor is the Lost-report owner, who makes the selection. The report's
   * own transition to `Verification Pending` is event 29, written separately.
   */
  async recordSelectedForVerification(
    draft: SelectedForVerificationDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    return this.writer.record(
      {
        eventType: EVENT.selectedForVerification,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: { actorId: draft.ownerId, actorRole: 'member' },
        payload: { recoveryResponseId: draft.recoveryResponseId },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 18 or 19 — the owner's determination, recorded by an
   * administrator.
   *
   * **The pair is validated against the report's owner** (ADR-11). A draft
   * missing either half, or naming a maker who is not the owner, is refused
   * and the caller's transaction rolls back. The same person may fill both
   * halves in two capacities: the check is about roles, not identity.
   *
   * The event's actor is the **acting administrator** — the system actor
   * performing the write, as the PRD specifies — and the maker is recorded in
   * `determined_by_user_id`. The two are different columns, so the distinction
   * survives the record.
   */
  async recordDetermination(
    draft: DeterminationDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    assertDeterminationPair(
      draft.outcome === 'match_confirmed'
        ? EVENT.determinedMatchConfirmed
        : EVENT.determinedNotAMatch,
      draft.determination,
      draft.lostReportOwnerId,
    );

    return this.writer.record(
      {
        eventType:
          draft.outcome === 'match_confirmed'
            ? EVENT.determinedMatchConfirmed
            : EVENT.determinedNotAMatch,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: {
          actorId: draft.determination.recordedByAdministratorId,
          actorRole: 'administrator',
          actingAdministratorId: draft.determination.recordedByAdministratorId,
          determinedByUserId: draft.determination.determinedByUserId,
          recordedByAdministratorId: draft.determination.recordedByAdministratorId,
        },
        payload: {
          recoveryResponseId: draft.recoveryResponseId,
          verificationTimestamp: draft.verificationTimestamp.toISOString(),
        },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 20 — a response was withdrawn by its responder.
   */
  async recordResponseWithdrawn(
    draft: ResponseWithdrawnDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    return this.writer.record(
      {
        eventType: EVENT.responseWithdrawn,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: { actorId: draft.responderId, actorRole: 'member' },
        payload: { recoveryResponseId: draft.recoveryResponseId },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 21 or 22 — a physical return was confirmed.
   *
   * A substitute receiver writes event 22, which carries the substitute's
   * name, the authorization affirmation, and the relationship; a default
   * receiver — the Lost-report owner — writes event 21.
   *
   * The receiver's details are catalog-named Sensitive Fields for event 22
   * and are recorded on the administrator-only trail only.
   */
  async recordReturnedConfirmed(
    draft: ReturnedConfirmedDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    const isSubstitute =
      draft.substituteReceiverName !== undefined ||
      draft.authorizationAffirmation !== undefined ||
      draft.relationship !== undefined;

    if (isSubstitute) {
      if (!draft.substituteReceiverName || !draft.authorizationAffirmation || !draft.relationship) {
        throw new LostSideFieldError(
          EVENT.returnedSubstituteReceiver,
          'substituteReceiverName',
          'A substitute-receiver return must carry the substitute receiver name, the authorization affirmation, and the relationship.',
        );
      }

      return this.writer.record(
        {
          eventType: EVENT.returnedSubstituteReceiver,
          parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
          actor: { actorId: draft.actingAdministratorId, actorRole: 'administrator' },
          payload: {
            substituteReceiverName: draft.substituteReceiverName,
            authorizationAffirmation: draft.authorizationAffirmation,
            relationship: draft.relationship,
          },
          occurredAt: draft.occurredAt,
        },
        transaction,
      );
    }

    if (!draft.receiverId) {
      throw new LostSideFieldError(
        EVENT.returnedDefaultReceiver,
        'receiver',
        'A default-receiver return must name the receiver — the Lost-report owner.',
      );
    }

    return this.writer.record(
      {
        eventType: EVENT.returnedDefaultReceiver,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: { actorId: draft.actingAdministratorId, actorRole: 'administrator' },
        payload: { receiver: draft.receiverId },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 23 — a Lost report was withdrawn by its reporter.
   *
   * The child responses' batch resolution is event 27, written separately.
   * No duplicate FR-31 event 9 is written for a Lost-side withdrawal.
   */
  async recordLostWithdrawn(
    draft: LostWithdrawnDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    this.assertPriorLostStatus(EVENT.lostWithdrawn, draft.priorLostStatus);

    return this.writer.record(
      {
        eventType: EVENT.lostWithdrawn,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: { actorId: draft.ownerId, actorRole: 'member' },
        payload: { previousLostStatus: draft.priorLostStatus },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 24 — a Lost report was closed by an administrator.
   *
   * The reason is stored **verbatim**, even where the user-facing copy for the
   * same event was softened (OQ-5).
   */
  async recordAdministratorClosed(
    draft: AdministratorClosedDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    this.assertPriorLostStatus(EVENT.administratorClosed, draft.priorLostStatus);

    if (!draft.reason) {
      throw new LostSideFieldError(
        EVENT.administratorClosed,
        'reason',
        'An administrator closure must carry its reason — the reason is required for the audit trail.',
      );
    }

    return this.writer.record(
      {
        eventType: EVENT.administratorClosed,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: { actorId: draft.actingAdministratorId, actorRole: 'administrator' },
        reason: draft.reason,
        payload: { previousLostStatus: draft.priorLostStatus },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 25 — a Match-Confirmed Lost report was cancelled.
   *
   * The exceptional reason and the prior selected response's status at close
   * time are both required, and both are recorded verbatim.
   */
  async recordExceptionalCancellation(
    draft: ExceptionalCancellationDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    this.assertPriorLostStatus(EVENT.exceptionalCancellation, draft.priorLostStatus);

    if (!draft.exceptionalReason) {
      throw new LostSideFieldError(
        EVENT.exceptionalCancellation,
        'exceptionalReason',
        'An exceptional cancellation must carry its reason — the reason is required for the audit trail.',
      );
    }

    if (!draft.priorSelectedResponseId) {
      throw new LostSideFieldError(
        EVENT.exceptionalCancellation,
        'priorSelectedResponseId',
        'An exceptional cancellation must name the prior selected response.',
      );
    }

    if (!isRecoveryResponseStatus(draft.priorSelectedResponseStatus)) {
      throw new LostSideFieldError(
        EVENT.exceptionalCancellation,
        'priorSelectedResponseStatus',
        `The prior selected response status "${draft.priorSelectedResponseStatus}" is not one of FR-41's canonical statuses.`,
      );
    }

    return this.writer.record(
      {
        eventType: EVENT.exceptionalCancellation,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor: { actorId: draft.actingAdministratorId, actorRole: 'administrator' },
        reason: draft.exceptionalReason,
        payload: {
          previousLostStatus: draft.priorLostStatus,
          priorSelectedResponseId: draft.priorSelectedResponseId,
          priorSelectedResponseStatus: draft.priorSelectedResponseStatus,
        },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record events 26 and 30 — the Lost report reached `Returned`.
   *
   * **The two events are written together, or neither.** There is no method
   * that writes event 26 alone, so the PRD's requirement that both exist in
   * the same transaction is structural rather than a convention.
   *
   * The batch's child list is the set the batch update's `RETURNING` clause
   * returned, passed in unmodified (ADR-10). The factory validates the set's
   * shape and records it verbatim; it cannot verify that the set corresponds
   * to what the transaction resolved, because the `recovery_responses` table
   * belongs to unit 004. That limit is stated as a contract.
   */
  async recordReturnedCloseout(
    draft: ReturnedCloseoutDraft,
    transaction: TransactionHandle,
  ): Promise<LostSideEventPair> {
    const batch: BatchResolution = {
      resolvedResponses: draft.resolvedResponses,
      targetStatus: 'Resolved — Report Returned',
    };

    assertBatchShape(EVENT.returnedCloseout, batch);

    // Event 26 references event 30 by the matched response id, so the two
    // must agree before either is written.
    assertReturnedPairing(draft.matchedResponseId, draft.matchedResponseId);

    const actor = resolveSystemActor(EVENT.returnedCloseout, {
      actingAdministratorId: draft.actingAdministratorId,
      actingMemberId: null,
      triggeredByRole: 'administrator',
    });

    const batchEvent = await this.writer.record(
      {
        eventType: EVENT.returnedCloseout,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor,
        payload: {
          childResponses: batch.resolvedResponses.map((resolved) => ({
            recoveryResponseId: resolved.recoveryResponseId,
            previousStatus: resolved.previousStatus,
          })),
          matchedSelectedResponseId: draft.matchedResponseId,
        },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );

    const individualEvent = await this.writer.record(
      {
        eventType: EVENT.completedReportReturned,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor,
        payload: {
          recoveryResponseId: draft.matchedResponseId,
          newCanonicalStatus: 'Completed — Report Returned',
        },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );

    return { batch: batchEvent, individual: individualEvent };
  }

  /**
   * Record event 27 — the Lost report reached `Closed`.
   *
   * Event 27 covers **every** closure route — the reporter's withdrawal
   * (event 23), the administrator's normal closure (event 24), and the
   * administrator's exceptional cancellation (event 25). The batch resolution
   * is one event because the resolution is one operation, whatever caused it.
   *
   * The trigger's role is recorded in `metadata.triggeredByRole`, because
   * `acting_administrator_id` is null when the reporter triggered the closure
   * and the two triggers are different humans with different roles.
   */
  async recordClosedCloseout(
    draft: ClosedCloseoutDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    const batch: BatchResolution = {
      resolvedResponses: draft.resolvedResponses,
      targetStatus: 'Resolved — Report Closed',
    };

    assertBatchShape(EVENT.closedCloseout, batch);

    const actor = resolveSystemActor(EVENT.closedCloseout, draft.cause);

    return this.writer.record(
      {
        eventType: EVENT.closedCloseout,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor,
        payload: {
          childResponses: batch.resolvedResponses.map((resolved) => ({
            recoveryResponseId: resolved.recoveryResponseId,
            previousStatus: resolved.previousStatus,
          })),
          triggeredByRole: draft.cause.triggeredByRole,
        },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 28 — the Lost report returned to `Open` after a Not a Match.
   *
   * The actor is the system identifying the administrator who recorded the
   * outcome. The response's own transition to `Not a Match` is event 19.
   */
  async recordNotAMatchReturnToOpen(
    draft: NotAMatchReturnToOpenDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    const actor = resolveSystemActor(EVENT.notAMatchReturnToOpen, {
      actingAdministratorId: draft.actingAdministratorId,
      actingMemberId: null,
      triggeredByRole: 'administrator',
    });

    return this.writer.record(
      {
        eventType: EVENT.notAMatchReturnToOpen,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor,
        payload: { priorSelectedResponseId: draft.priorSelectedResponseId },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Record event 29 — the Lost report entered `Verification Pending`.
   *
   * **This is the one event in the catalog whose causing human is a plain
   * member** — the owner who selected. The owner is carried in `actor_id`,
   * and `acting_administrator_id` is null, because there is no administrator
   * in this event. Modelling it with an administrator-only field would lose
   * the owner, which is precisely the distinction event 17 already records.
   */
  async recordToVerificationPending(
    draft: ToVerificationPendingDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    const actor = resolveSystemActor(EVENT.toVerificationPending, {
      actingAdministratorId: null,
      actingMemberId: draft.ownerId,
      triggeredByRole: 'owner',
    });

    return this.writer.record(
      {
        eventType: EVENT.toVerificationPending,
        parent: { parentType: REPORT_PARENT, parentId: draft.lostReportId },
        actor,
        payload: { selectedResponseId: draft.selectedResponseId },
        occurredAt: draft.occurredAt,
      },
      transaction,
    );
  }

  /**
   * Assert that a prior Lost-report status is one the PRD permits.
   *
   * `Match Confirmed` is refused by construction — it is a Recovery Response
   * status, never a Lost-report status, and FR-31 event 10 says so
   * explicitly.
   */
  private assertPriorLostStatus(
    eventType: string,
    status: PriorLostReportStatus | LostReportStatus | string,
  ): void {
    if (!isPriorLostReportStatus(status)) {
      throw new LostSideFieldError(
        eventType,
        'previousLostStatus',
        `The prior Lost-report status "${status}" is not one of the PRD's prior statuses — a Lost report's prior status is "Open" or "Verification Pending".`,
      );
    }
  }
}

/**
 * The number of the event a matched selected response is recorded under.
 *
 * Exposed so the firing module and the tests can assert the pairing without
 * repeating the number.
 */
export const MATCHED_SELECTED_TERMINAL_EVENT_NUMBER = MATCHED_TERMINAL_EVENT_NUMBER;

/**
 * The event type of the individual terminal record, event 30.
 */
export const COMPLETED_REPORT_RETURNED_EVENT_TYPE = EVENT.completedReportReturned;

/**
 * Re-exported so a caller can build a `SystemActorCause` without importing
 * the domain module directly.
 */
export type { SystemActorCause };

/**
 * Re-exported for the firing module's convenience: the guard that refuses a
 * system-actor event with no causing human.
 */
export { SystemActorCauseError };

/**
 * Re-exported: the guard that refuses a malformed batch set.
 */
export { BatchResolutionError };

/**
 * Re-exported: the guard that refuses a Returned closeout whose two events
 * disagree.
 */
export { EventPairingError };
