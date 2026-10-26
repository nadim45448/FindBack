import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_CATALOG,
  NUMBERED_EVENT_CATALOG,
  NON_NUMBERED_EVENT_CATALOG,
  findCatalogEntryByNumber,
  findCatalogEntryByType,
  isNumberedEventType,
  permittedFieldsFor,
  requiredEventNumber,
  sensitiveFieldsFor,
} from '@/domain/audit';

/**
 * The catalog is frozen by the PRD. These tests assert its shape, so a change
 * to it has to be a deliberate change to the PRD, not an accident in code.
 */
describe('audit event catalog', () => {
  it('holds exactly the thirty numbered events', () => {
    expect(NUMBERED_EVENT_CATALOG).toHaveLength(30);
  });

  it('numbers the events 1 through 30 with no gaps or duplicates', () => {
    const numbers = NUMBERED_EVENT_CATALOG.map((entry) => entry.number).sort((a, b) => a - b);

    expect(numbers).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
  });

  it('holds the two non-numbered records FR-31 names', () => {
    expect(NON_NUMBERED_EVENT_CATALOG.map((entry) => entry.type)).toEqual([
      'member_profile.edited',
      'report.edited_by_administrator',
    ]);
  });

  it('gives no non-numbered record a catalog number', () => {
    for (const entry of NON_NUMBERED_EVENT_CATALOG) {
      expect(Number.isNaN(entry.number)).toBe(true);
      expect(requiredEventNumber(entry.type)).toBeNull();
      expect(isNumberedEventType(entry.type)).toBe(false);
    }
  });

  it('has a unique type discriminator for every entry', () => {
    const types = AUDIT_EVENT_CATALOG.map((entry) => entry.type);

    expect(new Set(types).size).toBe(types.length);
  });

  it('maps every numbered type back to its own number', () => {
    for (const entry of NUMBERED_EVENT_CATALOG) {
      expect(requiredEventNumber(entry.type)).toBe(entry.number);
      expect(findCatalogEntryByNumber(entry.number)?.type).toBe(entry.type);
      expect(findCatalogEntryByType(entry.type)).toBe(entry);
    }
  });

  it('names the sensitive fields only on the events the PRD names them on', () => {
    // FR-31 event 2 — claim reason and identifying details.
    expect(sensitiveFieldsFor('claim.submitted')).toEqual(['reason', 'identifyingDetails']);

    // FR-48 event 15 — where-found and observed identifying details.
    expect(sensitiveFieldsFor('recovery_response.submitted')).toEqual([
      'whereFound',
      'observedIdentifyingDetails',
    ]);

    // FR-31 event 14 / FR-48 event 16 — thread message text.
    expect(sensitiveFieldsFor('thread.claim_message_posted')).toEqual(['messageText']);
    expect(sensitiveFieldsFor('recovery_response.thread_message_posted')).toEqual(['messageText']);

    // The receiver-substitution fields (events 7 and 22).
    expect(sensitiveFieldsFor('returned.confirmed_substitute_receiver')).toEqual([
      'substituteReceiverName',
      'authorizationAffirmation',
      'relationship',
    ]);

    // An event that names no sensitive field.
    expect(sensitiveFieldsFor('claim.approved')).toEqual([]);
  });

  it('names no credential field on any event', () => {
    for (const entry of AUDIT_EVENT_CATALOG) {
      for (const field of [...entry.additionalFields, ...entry.sensitiveFields]) {
        expect(field.toLowerCase()).not.toContain('password');
        expect(field.toLowerCase()).not.toContain('token');
      }
    }
  });

  it('returns no number, no fields, and no sensitive fields for an unknown type', () => {
    expect(requiredEventNumber('claim.obliterated')).toBeNull();
    expect(isNumberedEventType('claim.obliterated')).toBe(false);
    expect(findCatalogEntryByType('claim.obliterated')).toBeUndefined();
    expect(findCatalogEntryByNumber(99)).toBeUndefined();
  });

  it('returns no permitted fields for an unknown type', () => {
    expect(permittedFieldsFor('claim.obliterated')).toEqual([]);
    expect(sensitiveFieldsFor('claim.obliterated')).toEqual([]);
  });

  it('returns the permitted fields for a known type', () => {
    expect(permittedFieldsFor('report.created')).toContain('category');
    expect(permittedFieldsFor('claim.submitted')).toContain('reason');
  });
});
