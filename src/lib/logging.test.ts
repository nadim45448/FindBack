import { describe, expect, it } from 'vitest';

import { createRequestId, logEvent } from './logging';

/**
 * The pre-existing structured logger. Its rules come from `coding-standards`
 * § Logging and PRD §10: a request ID on every line, and never a sensitive
 * value.
 */
describe('structured logging', () => {
  it('writes one JSON object per event', () => {
    const lines: string[] = [];
    const original = console.log;

    console.log = (line: string) => {
      lines.push(line);
    };

    try {
      logEvent({
        requestId: 'req-1',
        actorId: 'admin-1',
        actorRole: 'administrator',
        action: 'audit.read',
        targetType: 'report',
        targetId: 'report-1',
        outcome: 'success',
        ts: '2026-10-26T09:00:00Z',
      });
    } finally {
      console.log = original;
    }

    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;

    expect(parsed.requestId).toBe('req-1');
    expect(parsed.actorId).toBe('admin-1');
    expect(parsed.action).toBe('audit.read');
    expect(parsed.targetId).toBe('report-1');
    expect(parsed.outcome).toBe('success');
  });

  it('omits the optional identifier fields when they are not given', () => {
    const lines: string[] = [];
    const original = console.log;

    console.log = (line: string) => {
      lines.push(line);
    };

    try {
      logEvent({
        requestId: 'req-2',
        actorRole: 'anonymous',
        action: 'report.browse',
        outcome: 'success',
        ts: '2026-10-26T09:00:00Z',
      });
    } finally {
      console.log = original;
    }

    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;

    expect(parsed.actorId).toBeUndefined();
    expect(parsed.targetId).toBeUndefined();
  });

  it('mints a distinct request id', () => {
    const first = createRequestId();
    const second = createRequestId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });
});
