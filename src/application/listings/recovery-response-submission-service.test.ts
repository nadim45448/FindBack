/**
 * The Recovery Response submission service's suite.
 *
 * **The sequence is the mechanism, and the sequence is asserted here.** The
 * service reads the report, reads the response facts, decides the gate,
 * validates the FR-44 fields, then writes the Response and the audit event in
 * one transaction — and only then sends the email. The order is what delivers
 * the PRD's rule that a refused submission writes nothing, and that the email
 * is never sent from inside the transaction.
 *
 * **The ports are fakes.** Each fake records what it was called with and in
 * what order, so the assertions are about the *orchestration* rather than
 * about a mock's return value.
 */

import { describe, expect, it } from 'vitest';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import {
  RecoveryResponseSubmissionRefusedError,
  RecoveryResponseSubmissionService,
  type RecoveryResponseSubject,
  type RecoveryResponseSubjectReader,
} from '@/application/listings/recovery-response-submission-service';
import { DefaultNewRecoveryResponseEmailBuilder } from '@/application/listings/new-recovery-response-email';
import type { ImageStore } from '@/application/listings/ports/image-store';
import type { RecoveryResponseReader } from '@/application/listings/ports/recovery-response-reader';
import type { RecoveryResponseRepository } from '@/application/listings/ports/recovery-response-repository';

import type { EmailSender, OutboundEmail } from '@/application/ports/email-sender';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { AuditEventRecord, TrailPage } from '@/application/ports/audit-event-repository';
import type { AuditEvent } from '@/domain/audit';

import type {
  PersistedRecoveryResponse,
  RecoveryResponseDraft,
  ValidatedRecoveryResponse,
} from '@/domain/recovery';

/** The order the calls happened in. */
type Call = string;

/** A fixed instant. */
const NOW = new Date('2026-10-30T12:00:00.000Z');

/** The transaction handle the fake factory hands out. */
const HANDLE: TransactionHandle = { transaction: { fake: true } };

/** The exact place the responder wrote. */
const WHERE_FOUND = 'On a bench outside the Main Library east entrance.';

/** The identifying details the responder observed. */
const OBSERVED = 'Brown leather, zip closure, scuffed on the back corner.';

/** The subject the reader returns by default. */
const SUBJECT: RecoveryResponseSubject = {
  id: 'report-1',
  type: 'Lost',
  status: 'Open',
  reporterId: 'the-owner',
  reporterEmail: 'owner@example.test',
  name: 'Brown wallet',
};

/** The deployment's active campus areas. */
const CAMPUS_AREAS = [
  { value: 'Main Library', label: 'Main Library', active: true },
];

/**
 * A recording fake of the ports plus the transaction factory.
 */
class Harness {
  readonly calls: Call[] = [];

  /** The subject the reader returns. `null` means "no such report". */
  subject: RecoveryResponseSubject | null = SUBJECT;

  /** Whether the selected response has reached `Match Confirmed`. */
  hasMatchConfirmed = false;

  /** Whether the responder already holds a live response. */
  hasLiveResponse = false;

  /** The validated response the repository was given. */
  received: ValidatedRecoveryResponse | null = null;

  /** The transaction handle the repository was given, if any. */
  responseHandle: TransactionHandle | null = null;

  /** The transaction handle the event factory was given, if any. */
  eventHandle: TransactionHandle | null = null;

  /** The audit events the writer recorded. */
  readonly events: AuditEventRecord[] = [];

  /** The emails the sender was asked to send. */
  readonly sent: OutboundEmail[] = [];

  /** When the email send fails, with this message. */
  emailFailure: string | null = null;

  /** The images the store was asked to keep. */
  readonly stored: { path: string }[] = [];

  /** The paths the store was asked to delete. */
  readonly deleted: string[] = [];

  /** When the image store fails, with this message. */
  imageFailure: string | null = null;

  readonly subjects: RecoveryResponseSubjectReader = {
    readSubject: async (): Promise<RecoveryResponseSubject | null> => {
      this.calls.push('subjects.readSubject');

      return this.subject;
    },
  };

  readonly reader: RecoveryResponseReader = {
    hasMatchConfirmed: async (): Promise<boolean> => {
      this.calls.push('reader.hasMatchConfirmed');

      return this.hasMatchConfirmed;
    },
    hasLiveResponse: async (): Promise<boolean> => {
      this.calls.push('reader.hasLiveResponse');

      return this.hasLiveResponse;
    },
  };

  readonly responses: RecoveryResponseRepository = {
    create: async (
      response: ValidatedRecoveryResponse,
      transaction: TransactionHandle,
    ): Promise<PersistedRecoveryResponse> => {
      this.calls.push('responses.create');
      this.received = response;
      this.responseHandle = transaction;

      return { ...response, id: 'response-1' };
    },
    findById: async (): Promise<never> => {
      throw new Error('findById is not part of the submission path.');
    },
  };

  readonly audit = new AuditWriter({
    append: async (event: AuditEventRecord, transaction: TransactionHandle): Promise<AuditEvent> => {
      this.calls.push('audit.record');
      this.events.push(event);
      this.eventHandle = transaction;

      return event as unknown as AuditEvent;
    },
    listByParent: async (): Promise<TrailPage> => {
      throw new Error('The submission path never reads the trail.');
    },
    listAll: async (): Promise<TrailPage> => {
      throw new Error('The submission path never reads the trail.');
    },
  });

  readonly events_factory = new LostSideEventFactory(this.audit);

  readonly emails: EmailSender = {
    send: async (message: OutboundEmail): Promise<void> => {
      this.calls.push('emails.send');
      this.sent.push(message);

      if (this.emailFailure !== null) {
        throw new Error(this.emailFailure);
      }
    },
  };

  readonly transactions: TransactionFactory = {
    run: async <T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> => {
      this.calls.push('transactions.run');

      return work(HANDLE);
    },
  };

  readonly images: ImageStore = {
    store: async (): Promise<{ path: string }> => {
      this.calls.push('images.store');

      if (this.imageFailure !== null) {
        throw new Error(this.imageFailure);
      }

      const stored = { path: 'recovery-response-candidates/a.png' };
      this.stored.push(stored);

      return stored;
    },
    delete: async (path: string): Promise<void> => {
      this.calls.push('images.delete');
      this.deleted.push(path);
    },
  };

  readonly clock = { now: (): Date => NOW };

  readonly service: RecoveryResponseSubmissionService = new RecoveryResponseSubmissionService(
    this.responses,
    this.reader,
    this.subjects,
    { listActive: async (): Promise<typeof CAMPUS_AREAS> => CAMPUS_AREAS },
    this.audit,
    this.transactions,
    this.clock,
    this.events_factory,
    this.images,
    this.emails,
    new DefaultNewRecoveryResponseEmailBuilder(),
    'https://findback.test',
  );
}

/** The draft the harness submits. */
function draft(overrides: Partial<RecoveryResponseDraft> = {}): RecoveryResponseDraft {
  return {
    reportId: 'report-1',
    campusArea: 'Main Library',
    whereFoundExactPlace: WHERE_FOUND,
    observedIdentifyingDetails: OBSERVED,
    dateFound: '2026-10-29',
    ...overrides,
  };
}

/** The actor the harness submits as. */
const ACTOR = { actorId: 'the-responder', isAccountActive: true };

describe('the recovery response submission service', () => {
  it('creates a Submitted response linked to the report', async () => {
    const harness = new Harness();

    const result = await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(result.status).toBe('Submitted');
    expect(result.responseId).toBe('response-1');
    expect(harness.received?.reportId).toBe('report-1');
  });

  it('records the responder as the responder, never a client-asserted one', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.received?.responderId).toBe('the-responder');
  });

  it('writes the response and the audit event in one transaction', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    // The Response and the audit event carry the **same** handle.
    expect(harness.responseHandle).toBe(HANDLE);
    expect(harness.eventHandle).toBe(HANDLE);
    expect(harness.calls).toContain('transactions.run');
  });

  it('records the recovery response submitted event with the catalogued fields', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.eventType).toBe('recovery_response.submitted');
    expect(harness.events[0]?.eventNumber).toBe(15);
    expect(harness.events[0]?.metadata).toMatchObject({
      whereFound: WHERE_FOUND,
      observedIdentifyingDetails: OBSERVED,
    });
  });

  it('records the responder as the actor and the report as the parent', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.events[0]?.actorId).toBe('the-responder');
    expect(harness.events[0]?.parentType).toBe('report');
    expect(harness.events[0]?.parentId).toBe('report-1');
  });

  it('sends the new-response email to the Lost report owner after the commit', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]?.to).toBe('owner@example.test');
  });

  it('sends the email after the transaction, never inside it', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    const transactionIndex = harness.calls.indexOf('transactions.run');
    const emailIndex = harness.calls.indexOf('emails.send');

    expect(emailIndex).toBeGreaterThan(transactionIndex);
  });

  it('never carries the exact place or the observed details in the email', async () => {
    // FR-44 makes both Sensitive Fields. The owner reaches them through the
    // authenticated surface, not through an email.
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    const message = harness.sent[0];

    expect(message?.textBody).not.toContain(WHERE_FOUND);
    expect(message?.htmlBody).not.toContain(WHERE_FOUND);
    expect(message?.textBody).not.toContain(OBSERVED);
    expect(message?.htmlBody).not.toContain(OBSERVED);
  });

  it('names the item in the email', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.sent[0]?.textBody).toContain('Brown wallet');
  });

  it('links to the Lost report in the email', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.sent[0]?.textBody).toContain(
      'https://findback.test/my/reports/report-1/review-responses',
    );
  });

  it('lets a send failure pass without failing the submission', async () => {
    // The Response is already `Submitted` and the event is already recorded;
    // the email only tells the owner about a fact that is now true.
    const harness = new Harness();
    harness.emailFailure = 'The SMTP server is unreachable.';

    const result = await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(result.status).toBe('Submitted');
  });

  it('runs the gate before the validation', async () => {
    // A responder whose account is not active must be told that — not that
    // their details are too short.
    const harness = new Harness();

    await expect(
      harness.service.submit({
        draft: draft({ observedIdentifyingDetails: 'short' }),
        actor: { actorId: 'the-responder', isAccountActive: false },
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });
});

describe('the recovery response submission refusals', () => {
  it('refuses a response on a report that does not exist, and writes nothing', async () => {
    const harness = new Harness();
    harness.subject = null;

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      PermissionDeniedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses a response from a member whose account is not active', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({
        draft: draft(),
        actor: { actorId: 'the-responder', isAccountActive: false },
      }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a member responding to their own Lost report, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({
        draft: draft(),
        actor: { actorId: 'the-owner', isAccountActive: true },
      }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses a response on a Found report', async () => {
    const harness = new Harness();
    harness.subject = { ...SUBJECT, type: 'Found' };

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      PermissionDeniedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a response on a closed report, and writes nothing', async () => {
    const harness = new Harness();
    harness.subject = { ...SUBJECT, status: 'Closed' };

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      PermissionDeniedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a response once the match has been confirmed', async () => {
    const harness = new Harness();
    harness.subject = { ...SUBJECT, status: 'Verification Pending' };
    harness.hasMatchConfirmed = true;

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      PermissionDeniedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('refuses a second live response from the same responder', async () => {
    const harness = new Harness();
    harness.hasLiveResponse = true;

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      RecoveryResponseSubmissionRefusedError,
    );

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
  });

  it('answers a duplicate with a conflict, not a permission failure', async () => {
    // The responder must wait for the existing response to resolve. That is
    // a conflict with an existing state, and the transport maps it to a 409.
    const harness = new Harness();
    harness.hasLiveResponse = true;

    await expect(harness.service.submit({ draft: draft(), actor: ACTOR })).rejects.toThrow(
      ConflictError,
    );
  });

  it('accepts a response while the report is at Verification Pending', async () => {
    // FR-40's nuance: the window runs *through* `Verification Pending`.
    const harness = new Harness();
    harness.subject = { ...SUBJECT, status: 'Verification Pending' };

    const result = await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(result.status).toBe('Submitted');
  });
});

describe('the recovery response submission validation', () => {
  it('refuses observed details that are too short, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({ draft: draft({ observedIdentifyingDetails: 'short' }), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).not.toContain('transactions.run');
    expect(harness.events).toHaveLength(0);
    expect(harness.sent).toHaveLength(0);
  });

  it('refuses a date found in the future, and writes nothing', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({ draft: draft({ dateFound: '2026-10-31' }), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('refuses a campus area that is not one of the deployment\'s', async () => {
    const harness = new Harness();

    await expect(
      harness.service.submit({ draft: draft({ campusArea: 'Elsewhere' }), actor: ACTOR }),
    ).rejects.toThrow(ValidationError);

    expect(harness.calls).not.toContain('transactions.run');
  });

  it('names the offending field in the validation error', async () => {
    const harness = new Harness();

    try {
      await harness.service.submit({
        draft: draft({ observedIdentifyingDetails: 'short' }),
        actor: ACTOR,
      });
      expect.unreachable('The submission should have been refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('observedIdentifyingDetails');
    }
  });

  it('accepts an empty exact place, because the field is optional', async () => {
    const harness = new Harness();

    const result = await harness.service.submit({
      draft: draft({ whereFoundExactPlace: '' }),
      actor: ACTOR,
    });

    expect(result.status).toBe('Submitted');
  });
});

describe('the recovery response candidate image', () => {
  /** A one-pixel PNG. */
  const IMAGE = {
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    contentType: 'image/png',
  };

  it('stores the image before the row is written', async () => {
    // **The blob is stored first**, because a Response pointing at an image
    // that was never stored would point at nothing.
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR, image: IMAGE });

    const storeIndex = harness.calls.indexOf('images.store');
    const createIndex = harness.calls.indexOf('responses.create');

    expect(storeIndex).toBeGreaterThanOrEqual(0);
    expect(storeIndex).toBeLessThan(createIndex);
  });

  it('attaches the stored reference to the response', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR, image: IMAGE });

    expect(harness.received?.candidateImageRef).toBe('recovery-response-candidates/a.png');
  });

  it('leaves the reference absent when no image was submitted', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.received?.candidateImageRef).toBeNull();
    expect(harness.calls).not.toContain('images.store');
  });

  it('deletes the blob when the row write fails', async () => {
    // **The compensating write.** The blob was stored, the row could not be
    // written, so the blob is deleted — after the rollback, because a delete
    // inside a rolling-back transaction would be undone by the rollback.
    const harness = new Harness();
    harness.responses.create = async (): Promise<never> => {
      harness.calls.push('responses.create');

      throw new Error('The write failed.');
    };

    await expect(
      harness.service.submit({ draft: draft(), actor: ACTOR, image: IMAGE }),
    ).rejects.toThrow('The write failed.');

    expect(harness.deleted).toEqual(['recovery-response-candidates/a.png']);
  });

  it('records that an image was present in the audit event', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR, image: IMAGE });

    expect(harness.events[0]?.metadata).toMatchObject({ imagePresence: true });
  });

  it('records that no image was present in the audit event', async () => {
    const harness = new Harness();

    await harness.service.submit({ draft: draft(), actor: ACTOR });

    expect(harness.events[0]?.metadata).toMatchObject({ imagePresence: false });
  });
});
