/**
 * Structured application logging.
 *
 * One JSON object per event, written to stdout.
 *
 * Rules (coding-standards, PRD §10):
 * - `requestId` on every line.
 * - Never log passwords, password-reset tokens, session tokens, Claim reasons,
 *   identifying details, thread message bodies, or any FR-37 sensitive value.
 *   Log the *fact* of the action, never its content.
 */

export type ActorRole = 'member' | 'administrator' | 'anonymous' | 'system';

export type LogOutcome = 'success' | 'denied' | 'error';

export interface LogEvent {
  requestId: string;
  actorId?: string;
  actorRole: ActorRole;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: LogOutcome;
  ts: string;
}

export function logEvent(event: LogEvent): void {
  // stdout is the log sink on Vercel, so a console call is intended here.
  console.log(JSON.stringify(event));
}

export function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}
