/**
 * The Recovery Response withdrawal service's suite.
 *
 * **The withdrawal is the responder's own exit, and the suite proves it is
 * narrow.** Only the responder may withdraw, only while the response is
 * untouched `Submitted`, and never once the owner has selected it.
 *
 * **The race is asserted, not just the rule.** The service reads the
 * response's facts, decides, and then writes — and the write is conditional
 * on the response still being `Submitted`. A response selected between the
 * read and the write is not withdrawn, the write lands nothing, and the
 * transaction rolls back with the conflict. **The domain's rule is the
 * user-facing half; the conditional write is the fact.**
 *
 * **The report is untouched, structurally.** The service holds no report
 * port at all, so there is no code path that could touch the report — and
 * the suite asserts that the withdrawal records no report move.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import { RecoveryResponseWithdrawalService } from '@/application/listings/recovery-response-withdrawal-service';
import type {
  RecoveryResponseWithdrawalFacts,
  RecoveryResponseWithdrawalRepository,
} from '@/application/listings/ports/recovery-response-withdrawal-repository';

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import type { RecoveryResponseStatus } from '@/domain/recovery';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The responder who made the response. */
const RESPONDER = { actorId: 'responder-1', isAccountActive: true };

/** Another member. */
const STRANGER = { actorId: 'stranger-1', isAccountActive: true };

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The response's facts, as the reader returns them. `null` means "no such response". */
  facts: RecoveryResponseWithdrawalFacts | null = {
    recoveryResponseId: 'response-1',
    lostReportId: 'report-1',
    status: 'Submitted',
    responderId: 'responder-1',
  };

  /**
   * Whether the conditional write lands.
   *
   * `false` is the lost race: the owner selected the response between the
   * read and the write.
   */
  writeLands = true;

  /** The handle the repository was given. */
  storedHandle: TransactionHandle | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly responses: RecoveryResponseWithdrawalRepository = {
    readWithdrawalFacts: async (
      _responseId: string,
      transaction?: TransactionHandle,
    ): Promise<RecoveryResponseWithdrawalFacts | null> => {
      this.calls.push(
        transaction === undefined ? 'responses.readWithdrawalFacts' : 'responses.readWithdrawalFacts.tx',
      );

      return this.facts;
    },
    withdraw: async (
      _responseId: string,
      transaction: TransactionHandle,
    ): Promise<boolean> => {
      this.calls.push('responses.withdraw');
      this.storedHandle = transaction;

      return this.writeLands;
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The withdrawal path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The withdrawal path never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly service: RecoveryResponseWithdrawalService = new RecoveryResponseWithdrawalService(
    this.responses,
    this.audit,
    this.transactions,
    new LostSideEventFactory(this.audit),
  );
}

// ── The permitted withdrawal ──────────────────────────────────────────────

describe('the recovery response withdrawal service', () => {
  it('withdraws a submitted response for its responder', async () => {
    const harness = new Harness();

    const result = await harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER });

    expect(result.responseId).toBe('response-1');
    expect(result.status).toBe('Withdrawn');
  });

  it('writes the withdrawal and its event in one transaction', async () => {
    const harness = new Harness();

    await harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER });

    // **The response's move and its audit event commit together or not at
    // all** (ADR-3, ADR-6) — the trail is append-only with no correction
    // path.
    const runIndex = harness.calls.indexOf('transactions.run');
    const withdrawIndex = harness.calls.indexOf('responses.withdraw');
    const auditIndex = harness.calls.indexOf('audit.record');

    expect(runIndex).toBeLessThan(withdrawIndex);
    expect(withdrawIndex).toBeLessThan(auditIndex);
  });

  it('passes the caller\'s transaction to the write', async () => {
    const harness = new Harness();

    await harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER });

    expect(harness.storedHandle).toBe(HANDLE);
  });

  it('records event 20 with the responder as the actor', async () => {
    const harness = new Harness();

    await harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER });

    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.eventType).toBe('recovery_response.withdrawn_by_responder');
    expect(harness.events[0]?.actorId).toBe('responder-1');
    expect(harness.events[0]?.actorRole).toBe('member');
    expect(harness.events[0]?.parentType).toBe('report');
    expect(harness.events[0]?.parentId).toBe('report-1');
    expect(harness.events[0]?.metadata).toEqual({ recoveryResponseId: 'response-1' });
  });
});

// ── The refusals ──────────────────────────────────────────────────────────

describe('the recovery response withdrawal service — refusals', () => {
  it('refuses a member who is not the responder', async () => {
    const harness = new Harness();

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: STRANGER }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('names the responder-only rule in the refusal', async () => {
    const harness = new Harness();

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: STRANGER }),
    ).rejects.toThrow(/made this response/);
  });

  it('refuses a deactivated responder', async () => {
    // **FR-5 preserves the response; it does not stop the account from
    // acting.** A deactivated responder keeps their response, but they may
    // not withdraw it.
    const harness = new Harness();
    const deactivated = { actorId: 'responder-1', isAccountActive: false };

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: deactivated }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the account is not active', async () => {
    const harness = new Harness();
    const deactivated = { actorId: 'responder-1', isAccountActive: false };

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: deactivated }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('responses.withdraw');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a response that does not exist', async () => {
    const harness = new Harness();
    harness.facts = null;

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the response does not exist', async () => {
    const harness = new Harness();
    harness.facts = null;

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a response that has already been selected', async () => {
    // **Once the owner has selected it, the decision belongs to the owner
    // and the administrator,** not to the responder.
    const harness = new Harness();
    harness.facts = { ...harness.facts!, status: 'Selected for Verification' };

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a response that has already been decided', async () => {
    const harness = new Harness();
    harness.facts = { ...harness.facts!, status: 'Not a Match' };

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(ConflictError);
  });

  it('writes nothing when the response may no longer be withdrawn', async () => {
    const harness = new Harness();
    harness.facts = { ...harness.facts!, status: 'Selected for Verification' };

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls).not.toContain('responses.withdraw');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a status the vocabulary does not own', async () => {
    // **A status nobody has thought about is refused, not waved through.**
    const harness = new Harness();
    harness.facts = {
      ...harness.facts!,
      status: 'Awaiting Inspection' as unknown as RecoveryResponseStatus,
    };

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(ConflictError);
  });
});

// ── The race ──────────────────────────────────────────────────────────────

describe('the recovery response withdrawal service — the race', () => {
  it('refuses when the conditional write lands nothing', async () => {
    // **The owner selected the response between the read and the write.**
    // The write matched no rows, so nothing is withdrawn.
    const harness = new Harness();
    harness.writeLands = false;

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(ConflictError);
  });

  it('records no event when the conditional write lands nothing', async () => {
    // **A withdrawal that did not happen gets no audit record** — the trail
    // is append-only, so a record for it would be a permanent falsehood.
    const harness = new Harness();
    harness.writeLands = false;

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(ConflictError);

    expect(harness.events).toHaveLength(0);
  });

  it('does not record the withdrawal when the write lands nothing', async () => {
    // **The event is written after the response's move,** so a move that
    // did not land is never followed by an event.
    const harness = new Harness();
    harness.writeLands = false;

    await expect(
      harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER }),
    ).rejects.toThrow(ConflictError);

    expect(harness.calls.indexOf('responses.withdraw')).toBeLessThan(
      harness.calls.indexOf('audit.record') === -1
        ? Number.POSITIVE_INFINITY
        : harness.calls.indexOf('audit.record'),
    );
    expect(harness.calls).not.toContain('audit.record');
  });
});

// ── The report is untouched ───────────────────────────────────────────────

describe('the recovery response withdrawal service — the report', () => {
  it('records nothing about the report\'s status', async () => {
    // **The report is not touched by a withdrawal.** A withdrawn response
    // leaves the Lost report's status unaffected — and the event says
    // nothing about it, because nothing about it changed.
    const harness = new Harness();

    await harness.service.withdraw({ responseId: 'response-1', actor: RESPONDER });

    expect(harness.events[0]?.metadata).toEqual({ recoveryResponseId: 'response-1' });
    expect(Object.keys(harness.events[0]?.metadata ?? {})).not.toContain('reportStatus');
  });
});
