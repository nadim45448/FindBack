/**
 * The responder reader — the address a determination notifies.
 *
 * **A separate port from the selection repository, because the read serves a
 * different purpose.** The selection repository answers "what is this
 * response's status?"; this answers "who do we tell, and where?" The
 * determination's notification is a *consequence* of a fact already
 * committed (ADR-3's decision 4), so this read happens **after the commit** —
 * there is nothing here that could undo the determination.
 *
 * **A `null` is a legitimate answer.** A response with no reachable responder
 * is notified to nobody; the determination stands either way.
 *
 * Pure — no I/O, no framework imports.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The responder a determination notifies. */
export interface RecoveryResponseResponder {
  /** The responder's email address. */
  readonly email: string;
}

/** Reads the responder a determination notifies. */
export interface RecoveryResponseResponderReader {
  /**
   * Read the responder of a response.
   *
   * @returns the responder, or `null` when no response carries that id.
   */
  readResponder(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseResponder | null>;
}
