import { describe, expect, it } from 'vitest';

import {
  clampTrailLimit,
  decodeTrailCursor,
  describeTrailFilters,
  describeTrailQuery,
  encodeTrailCursor,
  isTrailParentType,
  TRAIL_PAGE_SIZE,
} from './trail-query';

describe('clampTrailLimit', () => {
  it('caps a larger request at the page size', () => {
    expect(clampTrailLimit(1000)).toBe(TRAIL_PAGE_SIZE);
    expect(clampTrailLimit(26)).toBe(TRAIL_PAGE_SIZE);
  });

  it('keeps a smaller request', () => {
    expect(clampTrailLimit(10)).toBe(10);
    expect(clampTrailLimit(1)).toBe(1);
  });

  it('defaults to the page size when no limit is given', () => {
    expect(clampTrailLimit(null)).toBe(TRAIL_PAGE_SIZE);
    expect(clampTrailLimit(undefined)).toBe(TRAIL_PAGE_SIZE);
  });

  it('defaults to the page size for a non-finite limit', () => {
    expect(clampTrailLimit(Number.NaN)).toBe(TRAIL_PAGE_SIZE);
    expect(clampTrailLimit(Number.POSITIVE_INFINITY)).toBe(TRAIL_PAGE_SIZE);
  });

  it('never returns less than one', () => {
    expect(clampTrailLimit(0)).toBe(1);
    expect(clampTrailLimit(-5)).toBe(1);
  });
});

describe('the trail cursor', () => {
  it('round-trips through its opaque encoding', () => {
    const cursor = { occurredAt: new Date('2026-10-26T12:00:00.000Z'), id: 'event-1' };

    const decoded = decodeTrailCursor(encodeTrailCursor(cursor));

    expect(decoded?.id).toBe('event-1');
    expect(decoded?.occurredAt.toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });

  it('encodes to a URL-safe token', () => {
    const token = encodeTrailCursor({ occurredAt: new Date(), id: 'event-1' });

    expect(token).not.toMatch(/[+/=]/);
  });

  it('decodes a missing token as no cursor', () => {
    expect(decodeTrailCursor(null)).toBeNull();
    expect(decodeTrailCursor(undefined)).toBeNull();
    expect(decodeTrailCursor('')).toBeNull();
  });

  it('decodes a malformed token as no cursor', () => {
    expect(decodeTrailCursor('not-base64-json')).toBeNull();
    expect(decodeTrailCursor(Buffer.from('{}', 'utf8').toString('base64url'))).toBeNull();
    expect(
      decodeTrailCursor(Buffer.from('{"occurredAt":123}', 'utf8').toString('base64url')),
    ).toBeNull();
    expect(decodeTrailCursor(Buffer.from('{"id":"x"}', 'utf8').toString('base64url'))).toBeNull();
    expect(
      decodeTrailCursor(
        Buffer.from('{"occurredAt":"nope","id":"x"}', 'utf8').toString('base64url'),
      ),
    ).toBeNull();
  });

  it('rejects a token with an empty id', () => {
    expect(
      decodeTrailCursor(
        Buffer.from('{"occurredAt":"2026-10-26T12:00:00.000Z","id":""}', 'utf8').toString(
          'base64url',
        ),
      ),
    ).toBeNull();
  });
});

describe('isTrailParentType', () => {
  it('accepts the parent types the trail can be read for', () => {
    expect(isTrailParentType('report')).toBe(true);
    expect(isTrailParentType('claim')).toBe(true);
    expect(isTrailParentType('recovery_response')).toBe(true);
    expect(isTrailParentType('account')).toBe(true);
  });

  it('rejects an unknown parent type', () => {
    expect(isTrailParentType('not_a_parent')).toBe(false);
    expect(isTrailParentType('')).toBe(false);
  });
});

describe('describeTrailFilters', () => {
  it('describes an empty filter set as nulls', () => {
    expect(describeTrailFilters({})).toEqual({
      eventTypes: null,
      from: null,
      to: null,
      actorId: null,
    });
  });

  it('describes each applied filter', () => {
    const described = describeTrailFilters({
      eventTypes: ['claim.approved', 'claim.rejected'],
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-26T00:00:00.000Z'),
      actorId: 'admin-1',
    });

    expect(described.eventTypes).toEqual(['claim.approved', 'claim.rejected']);
    expect(described.from).toBe('2026-10-01T00:00:00.000Z');
    expect(described.to).toBe('2026-10-26T00:00:00.000Z');
    expect(described.actorId).toBe('admin-1');
  });

  it('treats an empty event-type list as no filter', () => {
    expect(describeTrailFilters({ eventTypes: [] }).eventTypes).toBeNull();
  });

  it('carries no trail content — only the filter values', () => {
    const described = describeTrailFilters({ actorId: 'admin-1' });

    expect(Object.keys(described).sort()).toEqual(['actorId', 'eventTypes', 'from', 'to']);
  });
});

describe('describeTrailQuery', () => {
  it('names the parent for a contextual read', () => {
    expect(describeTrailQuery({ parentType: 'report', parentId: 'report-1' })).toBe(
      'report:report-1',
    );
  });

  it('names the whole trail for a whole-trail read', () => {
    expect(describeTrailQuery({})).toBe('all');
  });
});
