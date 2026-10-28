/**
 * The outbound-email port.
 *
 * **A shared port** (ADR-14). The transport will also serve the
 * `notifications` module, so the port lives in the shared `application/ports/`
 * directory rather than inside `application/accounts/ports/` — a port owned
 * by one module and consumed by another would be a dependency in the wrong
 * direction, and `coding-standards.md`'s dependency rule forbids
 * `accounts → notifications`.
 *
 * The port carries only what a transport needs. It carries **no** account id,
 * no role, and no display name, so the content is built by the owning module
 * and the transport has nothing to leak.
 */

/** A message to send. */
export interface OutboundEmail {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

/**
 * Sends one email.
 *
 * A send failure **never** rolls back or blocks the action that triggered
 * it (PRD §10) — the caller catches the failure and logs it. The port itself
 * does not swallow the error, because a swallowed error is an unrecorded
 * failure, and PRD §10 requires the failure to be recorded.
 */
export interface EmailSender {
  /**
   * Send one email.
   *
   * **No transaction handle.** The email is sent **after** the triggering
   * transaction has committed (ADR-3, decision 4), so there is no
   * transaction to join — and requiring one would invite a caller to send
   * inside a transaction, which is exactly what ADR-3 forbids.
   *
   * @throws whatever the transport throws. The caller logs the failure and
   * lets the triggering action stand.
   */
  send(message: OutboundEmail): Promise<void>;
}
