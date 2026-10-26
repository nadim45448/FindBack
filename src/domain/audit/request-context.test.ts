import { describe, expect, it } from 'vitest';

import { createRequestContext } from './request-context';

/**
 * `RequestContext` is the closed type the operational logger accepts. Its
 * shape is the control that keeps a sensitive value out of a log line — so
 * the fields it does and does not have are worth asserting.
 */
describe('request context', () => {
  it('fills in the timestamp when it is not supplied', () => {
    const before = Date.now();
    const context = createRequestContext({
      requestId: 'req-1',
      actorRole: 'member',
      action: 'claim.submitted',
      outcome: 'success',
    });

    expect(context.ts).toBeDefined();

    const timestamp = new Date(context.ts).getTime();

    expect(timestamp).toBeGreaterThanOrEqual(before);
  });

  it('keeps a supplied timestamp', () => {
    const context = createRequestContext({
      requestId: 'req-1',
      actorRole: 'administrator',
      action: 'audit.read',
      outcome: 'denied',
      ts: '2026-10-26T09:00:00Z',
    });

    expect(context.ts).toBe('2026-10-26T09:00:00Z');
  });

  it('carries the identifiers the PRD requires', () => {
    const context = createRequestContext({
      requestId: 'req-1',
      actorId: 'admin-1',
      actorRole: 'administrator',
      action: 'audit.read',
      targetType: 'report',
      targetId: 'report-1',
      outcome: 'success',
    });

    expect(context.requestId).toBe('req-1');
    expect(context.actorId).toBe('admin-1');
    expect(context.action).toBe('audit.read');
    expect(context.targetId).toBe('report-1');
  });

  it('has no field that could carry a sensitive value', () => {
    const context = createRequestContext({
      requestId: 'req-1',
      actorRole: 'member',
      action: 'claim.submitted',
      outcome: 'success',
    });

    const fields = Object.keys(context);

    for (const field of fields) {
      expect(field).not.toBe('reason');
      expect(field).not.toBe('identifyingDetails');
      expect(field).not.toBe('messageText');
      expect(field).not.toBe('password');
      expect(field).not.toBe('token');
    }
  });
});
