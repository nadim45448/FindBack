/**
 * The audit writer — the only writer of audit records.
 *
 * **The transaction handle is a required parameter.** There is no optional-tx
 * overload and the writer never opens its own transaction. A write that
 * commits on its own would be an audit record for a transition that may not
 * have happened, so the type makes that impossible rather than the code
 * checking for it.
 *
 * The writer is also where the payload is sanitized, so an event-specific
 * field the catalog does not name is refused at the last possible moment —
 * before the insert.
 */

import {
  buildAuditEventFields,
  looksLikeSecret,
  sanitizeForTrail,
  type AuditEvent,
  type AuditEventDraft,
} from '@/domain/audit';
import { AuditPayloadRejectedError, AuditWriteOutsideTransactionError } from '@/domain/audit';
import type { AuditEventRepository } from './ports/audit-event-repository';
import { isTransactionHandle, type TransactionHandle } from './ports/transaction-handle';

/** Writes audit records inside a caller's transaction. */
export class AuditWriter {
  constructor(private readonly events: AuditEventRepository) {}

  /**
   * Append one audit event inside the caller's transaction.
   *
   * @throws {AuditWriteOutsideTransactionError} when the handle is missing.
   * @throws {AuditPayloadRejectedError} when the payload carries a field the
   * catalog does not name, or a value that is barred everywhere.
   * @throws {AuditCatalogViolationError} when the event type is not in the
   * frozen catalog.
   */
  async record(draft: AuditEventDraft, transaction: TransactionHandle): Promise<AuditEvent> {
    if (!isTransactionHandle(transaction)) {
      throw new AuditWriteOutsideTransactionError();
    }

    const payload = draft.payload ? sanitizeForTrail(draft.eventType, draft.payload) : null;

    // The `reason` column is a typed column, not a payload field, so it does
    // not pass through the sanitizer. It is checked here instead, because a
    // password, hash, or token is **never** written to the trail or the log —
    // the trail's Sensitive-Field exception covers catalog-named *fields*, not
    // credentials, and a reason is administrator-supplied free text that
    // could carry one by accident.
    if (draft.reason && looksLikeSecret(draft.reason)) {
      throw new AuditPayloadRejectedError(
        draft.eventType,
        'reason',
        'The reason on this audit event appears to be a credential, and a credential is never written to the trail.',
      );
    }

    const fields = buildAuditEventFields({ ...draft, payload: payload?.fields ?? undefined });

    // The id and the creation timestamp are assigned here, not taken from the
    // draft: an id is minted once, and `createdAt` records when the row was
    // written, while `occurredAt` records when the action happened.
    const createdAt = new Date();

    return this.events.append(
      {
        ...fields,
        id: crypto.randomUUID(),
        createdAt,
      },
      transaction,
    );
  }

  /**
   * Append one non-numbered record (FR-52 profile edit, FR-53 report edit).
   *
   * The distinction from `record` is the guarantee that no catalog number is
   * attached — the catalog entry for these types has no number, so the number
   * resolves to null.
   */
  async recordNonNumbered(
    draft: AuditEventDraft,
    transaction: TransactionHandle,
  ): Promise<AuditEvent> {
    return this.record(draft, transaction);
  }

  /**
   * Append several events in one caller's transaction.
   *
   * Required by FR-45's Confirm Returned, which produces the Returned event,
   * the batch child-resolution event, and the matched response's terminal
   * event in a single transaction.
   */
  async recordBatch(
    drafts: readonly AuditEventDraft[],
    transaction: TransactionHandle,
  ): Promise<readonly AuditEvent[]> {
    if (!isTransactionHandle(transaction)) {
      throw new AuditWriteOutsideTransactionError();
    }

    const written: AuditEvent[] = [];
    for (const draft of drafts) {
      written.push(await this.record(draft, transaction));
    }
    return written;
  }
}
