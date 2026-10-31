/**
 * The content removal service's suite.
 *
 * **A removal withholds content; it does not close the report.** Four
 * properties carry the service:
 *
 * 1. **The report's status is never written.** FR-36 says the report's
 *    status is "unchanged unless closure was separately requested", and the
 *    service takes no route to a closure at all.
 * 2. **A repeated removal records nothing new.** The story's edge case is
 *    explicit: *"A repeated removal on the same target is idempotent — no
 *    duplicate audit entry."*
 * 3. **The removal's row goes in before the content is marked.** The unique
 *    constraint on the target must refuse a duplicate before anything is
 *    touched.
 * 4. **Only an administrator may remove.** The flag comes from the session,
 *    never from the request body.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order.
 */

import { describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { ContentRemovalService } from '@/application/listings/content-removal-service';
import type {
  ContentRemovalRepository,
  ContentRemovalTargetState,
} from '@/application/listings/ports/content-removal-repository';

import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import { NotFoundError, PermissionDeniedError, ValidationError } from '@/lib/errors';

// ── The harness ─────────────────────────────────────────────────────────────

/** The order the calls happened in. */
type Call = string;

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The administrator who is removing. */
const ADMINISTRATOR = { actorId: 'admin-1', isAdministrator: true };

/** A member who is not an administrator. */
const MEMBER = { actorId: 'member-1', isAdministrator: false };

/** The administrator's reason. */
const REASON = 'The photograph shows another person and must be taken down.';

/** The target being removed. */
const TARGET = { kind: 'report_image' as const, targetId: 'image-1' };

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The target's state. `null` means "no such content". */
  state: ContentRemovalTargetState | null = { alreadyRemoved: false };

  /** The removal rows the repository was asked to insert. */
  readonly removals: {
    reportId: string;
    target: { kind: string; targetId: string };
    reason: string;
    administratorId: string;
  }[] = [];

  /** The targets the repository was asked to withhold. */
  readonly withheld: { kind: string; targetId: string }[] = [];

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  readonly removals$ = {
    readTargetState: async (
      _reportId: string,
      _target: { kind: string; targetId: string },
    ): Promise<ContentRemovalTargetState | null> => {
      this.calls.push('removals.readTargetState');

      return this.state;
    },
    withholdContent: async (
      target: { kind: string; targetId: string },
      _transaction: TransactionHandle,
    ): Promise<void> => {
      this.calls.push('removals.withholdContent');

      this.withheld.push(target);
    },
    recordRemoval: async (
      removal: {
        reportId: string;
        target: { kind: string; targetId: string };
        reason: string;
        administratorId: string;
      },
      _transaction: TransactionHandle,
    ): Promise<void> => {
      this.calls.push('removals.recordRemoval');

      this.removals.push(removal);
    },
  } satisfies ContentRemovalRepository;

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord): Promise<AuditEvent> => {
      this.calls.push('audit.record');

      this.events.push(event);

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The removal never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The removal never reads the trail.');
    },
  });

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly service: ContentRemovalService = new ContentRemovalService(
    this.removals$,
    this.audit,
    this.transactions,
  );
}

// ── The authorisation ───────────────────────────────────────────────────────

describe('the content removal service — the authorisation', () => {
  it('refuses a member who is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.remove({
        reportId: 'report-1',
        actor: MEMBER,
        target: TARGET,
        reason: REASON,
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the actor is not an administrator', async () => {
    const harness = new Harness();

    await expect(
      harness.service.remove({
        reportId: 'report-1',
        actor: MEMBER,
        target: TARGET,
        reason: REASON,
      }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).toEqual([]);
    expect(harness.events).toEqual([]);
  });
});

// ── The target ──────────────────────────────────────────────────────────────

describe('the content removal service — the target', () => {
  it('refuses a target the report does not have', async () => {
    const harness = new Harness();
    harness.state = null;

    await expect(
      harness.service.remove({
        reportId: 'report-1',
        actor: ADMINISTRATOR,
        target: TARGET,
        reason: REASON,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('writes nothing when the target does not exist', async () => {
    const harness = new Harness();
    harness.state = null;

    await expect(
      harness.service.remove({
        reportId: 'report-1',
        actor: ADMINISTRATOR,
        target: TARGET,
        reason: REASON,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toEqual([]);
  });

  it('refuses a target kind the system does not hold', async () => {
    const harness = new Harness();

    // **The kind is closed, and the check lives in the domain.** The route
    // refuses an unknown kind at the transport boundary, but the service is
    // the domain's own gate — and a caller that reached it another way must
    // still be refused. **A removal against a kind the system does not hold
    // would record a moderation act against nothing.**
    await expect(
      harness.service.remove({
        reportId: 'report-1',
        actor: ADMINISTRATOR,
        target: { kind: 'report' as 'report_image', targetId: 'image-1' },
        reason: REASON,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toEqual([]);
  });
});

// ── The reason ──────────────────────────────────────────────────────────────

describe('the content removal service — the reason', () => {
  it('refuses a removal with no reason', async () => {
    const harness = new Harness();

    await expect(
      harness.service.remove({
        reportId: 'report-1',
        actor: ADMINISTRATOR,
        target: TARGET,
        reason: '',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a reason shorter than ten characters', async () => {
    const harness = new Harness();

    await expect(
      harness.service.remove({
        reportId: 'report-1',
        actor: ADMINISTRATOR,
        target: TARGET,
        reason: 'Too short',
      }),
    ).rejects.toThrow(ValidationError);
  });
});

// ── The write ───────────────────────────────────────────────────────────────

describe('the content removal service — the write', () => {
  it('records the removal before it withholds the content', async () => {
    const harness = new Harness();

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    // **The unique constraint on the target must refuse a duplicate before
    // anything is touched** — so the row goes in first, and a repeated
    // removal raises the constraint with the content's mark rolled back
    // alongside it.
    expect(harness.calls).toEqual([
      'removals.readTargetState',
      'transactions.run',
      'removals.recordRemoval',
      'removals.withholdContent',
      'audit.record',
    ]);
  });

  it('withholds the content rather than deleting it', async () => {
    const harness = new Harness();

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    // **The trail is append-only (ADR-6),** so a record naming removed
    // content must remain verifiable — which means the content it names must
    // still exist.
    expect(harness.withheld).toEqual([{ kind: 'report_image', targetId: 'image-1' }]);
  });

  it('records the removal row with the administrator and the reason', async () => {
    const harness = new Harness();

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    expect(harness.removals[0]).toEqual({
      reportId: 'report-1',
      target: TARGET,
      reason: REASON,
      administratorId: 'admin-1',
    });
  });

  it('records the removal in the trail', async () => {
    const harness = new Harness();

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    const event = harness.events[0];

    // **FR-36 asks for the record explicitly:** "the action records the
    // administrator and timestamp", and "the audit trail retains the entry".
    expect(event?.eventType).toBe('content.removed_by_administrator');
    expect(event?.parentType).toBe('report');
    expect(event?.parentId).toBe('report-1');
    expect(event?.actorRole).toBe('administrator');
    expect(event?.actorId).toBe('admin-1');
  });

  it('records the target and the reason in the payload', async () => {
    const harness = new Harness();

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    // **The payload carries exactly the catalog's three fields.** The
    // sanitizer denies by default, so naming those three permits exactly
    // those three.
    expect(harness.events[0]?.metadata).toEqual({
      targetKind: 'report_image',
      targetId: 'image-1',
      removalReason: REASON,
    });
  });

  it('keeps a reason containing markup verbatim', async () => {
    const harness = new Harness();
    const marked = '<script>alert("x")</script> The image is inappropriate.';

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: marked,
    });

    // **The reason is stored verbatim and never rendered as HTML.** Storing
    // it verbatim is this layer's half of the guarantee.
    expect(harness.removals[0]?.reason).toBe(marked);
  });

  it('never writes the report\'s status', async () => {
    const harness = new Harness();

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    // **A removal is not a lifecycle transition.** A record that said "this
    // report was closed" when it was not would be a false statement in a
    // trail that cannot be corrected.
    expect(harness.calls).not.toContain('reports.update');
    expect(harness.calls.filter((call) => call.includes('status'))).toEqual([]);
  });
});

// ── The idempotence ─────────────────────────────────────────────────────────

describe('the content removal service — the idempotence', () => {
  it('records nothing when the target is already withheld', async () => {
    const harness = new Harness();
    harness.state = { alreadyRemoved: true };

    const result = await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    // **The removal still succeeds** — the content stays withheld — but the
    // trail already held this exact moderation act.
    expect(result.recorded).toBe(false);
    expect(result.eventId).toBeNull();
    expect(harness.events).toEqual([]);
  });

  it('still withholds the content on a repeated removal', async () => {
    const harness = new Harness();
    harness.state = { alreadyRemoved: true };

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    expect(harness.withheld).toEqual([{ kind: 'report_image', targetId: 'image-1' }]);
  });

  it('records a new removal when the target is not yet withheld', async () => {
    const harness = new Harness();

    const result = await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    expect(result.recorded).toBe(true);
    expect(result.eventId).not.toBeNull();
  });

  it('reads the target\'s state rather than being told it', async () => {
    const harness = new Harness();

    await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    // **The state is a fact about the content.** A client that could assert
    // it would be choosing whether its own repeated action produced a
    // second audit record.
    expect(harness.calls[0]).toBe('removals.readTargetState');
  });
});

// ── The result ──────────────────────────────────────────────────────────────

describe('the content removal service — the result', () => {
  it('names the report and the target', async () => {
    const harness = new Harness();

    const result = await harness.service.remove({
      reportId: 'report-1',
      actor: ADMINISTRATOR,
      target: TARGET,
      reason: REASON,
    });

    expect(result.reportId).toBe('report-1');
    expect(result.target).toEqual(TARGET);
  });
});
