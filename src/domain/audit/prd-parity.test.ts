/**
 * The PRD-parity check for the audit-event catalog.
 *
 * The catalog exists in two places: the frozen PRD, and
 * `src/domain/audit/event-catalog.ts`. A test that asserts the catalog's
 * *shape* does not catch a drift between the two — a catalog edit that
 * renames an event, moves a number, or drops a field would pass the shape
 * test and silently contradict the frozen PRD.
 *
 * This test closes that gap by reading the PRD itself. The PRD is the
 * authority; the catalog must agree with it.
 *
 * The PRD's two event lists have a stable, machine-readable shape:
 *
 *     15. **Recovery Response submitted** — actor (responder), Lost report ID, ...
 *
 * so the check parses the numbered lines of the FR-31 and FR-48 sections and
 * compares each number's title and its named fields against the catalog.
 *
 * **On where a field lives.** The PRD names some fields in prose
 * ("where-found", "observed identifying details"), some as backticked
 * identifiers (`determined_by`), and some only as a role ("receiver (Lost-report
 * owner)"). A field the PRD names may be carried in one of two places:
 *
 * - the **payload** — the catalog's `additionalFields`, the jsonb metadata;
 * - a **typed column** — `determinedByUserId`, `recordedByAdministratorId`,
 *   `reason`, and the rest of `AuditEvent`'s columns.
 *
 * The check therefore asserts that every field the PRD names is carried
 * *somewhere* for that event, and that a field carried in a typed column is
 * really a column on the model. It does not insist on which of the two a
 * given field uses — that is a design decision recorded in the bolt's
 * technical design, not a PRD requirement.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_CATALOG, findCatalogEntryByNumber } from '@/domain/audit';

/** The frozen PRD. It is the authority the catalog must agree with. */
const PRD_PATH = resolve(
  process.cwd(),
  '_bmad-output/planning-artifacts/prds/prd-FindBack-2026-08-28/prd.md',
);

/** The Prisma schema, for the typed-column check. */
const SCHEMA_PATH = resolve(process.cwd(), 'prisma/schema.prisma');

/** Where a field is carried. */
type Carrier = 'payload' | 'column';

/** One PRD field name, and where the catalog may carry it. */
interface PrdField {
  /** The catalog's field name. */
  readonly field: string;
  readonly carrier: Carrier;
}

/** One event as the PRD states it. */
interface PrdEvent {
  readonly number: number;
  /** The event's title, exactly as the PRD writes it. */
  readonly title: string;
  /** The whole line, lower-cased, for the field-name search. */
  readonly prose: string;
}

/** The sections of the PRD the two event lists live in. */
const PRD_EVENT_SECTIONS = ['FR-31', 'FR-48'] as const;

/**
 * The PRD's prose field names, mapped onto the catalog's field names.
 *
 * The order matters: the longer phrases come first, and a matched phrase is
 * **consumed** from the prose before the next is tried. Without that,
 * "prior selected response ID" would also match "selected response ID", and
 * the check would demand a field the PRD does not name.
 */
const PRD_FIELD_NAMES: readonly (readonly [string, PrdField])[] = [
  ['matched selected response id', { field: 'matchedSelectedResponseId', carrier: 'payload' }],
  ['prior selected response id', { field: 'priorSelectedResponseId', carrier: 'payload' }],
  ['selected response id', { field: 'selectedResponseId', carrier: 'payload' }],
  ['previous found-report lifecycle status', { field: 'previousFoundStatus', carrier: 'payload' }],
  ['prior lost-report lifecycle status', { field: 'previousLostStatus', carrier: 'payload' }],
  ['auto-rejection trigger reason', { field: 'autoRejectionReason', carrier: 'payload' }],
  ['closure reason', { field: 'closureReason', carrier: 'payload' }],
  ['exceptional reason', { field: 'reason', carrier: 'column' }],
  ['observed identifying details', { field: 'observedIdentifyingDetails', carrier: 'payload' }],
  ['substitute receiver name', { field: 'substituteReceiverName', carrier: 'payload' }],
  ['authorization affirmation', { field: 'authorizationAffirmation', carrier: 'payload' }],
  ['snapshot of changed fields', { field: 'changedFieldsSnapshot', carrier: 'payload' }],
  ['verification timestamp', { field: 'verificationTimestamp', carrier: 'payload' }],
  ['new canonical status', { field: 'newCanonicalStatus', carrier: 'payload' }],
  ['triggering_action', { field: 'triggeringAction', carrier: 'payload' }],
  ['triggered_by', { field: 'triggeredBy', carrier: 'payload' }],
  ['determined_by', { field: 'determinedByUserId', carrier: 'column' }],
  ['recorded_by', { field: 'recordedByAdministratorId', carrier: 'column' }],
  ['where-found', { field: 'whereFound', carrier: 'payload' }],
  ['date found', { field: 'dateFound', carrier: 'payload' }],
  ['image presence', { field: 'imagePresence', carrier: 'payload' }],
  ['message text', { field: 'messageText', carrier: 'payload' }],
  ['relationship', { field: 'relationship', carrier: 'payload' }],
  ['receiver', { field: 'receiver', carrier: 'payload' }],
  ['reason', { field: 'reason', carrier: 'column' }],
];

/** The typed columns on `AuditEvent` that carry a PRD-named field. */
const TYPED_COLUMNS: readonly string[] = [
  'actingAdministratorId',
  'determinedByUserId',
  'recordedByAdministratorId',
  'reason',
  'previousValues',
  'changedFields',
];

/**
 * The PRD's numbered event lists.
 *
 * Only the FR-31 and FR-48 sections are read. The PRD holds other numbered
 * lists — the administrator dashboard's queues, the notification list — and
 * a naive scan of the whole document would pick them up.
 */
function readPrdEvents(): PrdEvent[] {
  const prd = readFileSync(PRD_PATH, 'utf8');
  const lines = prd.split('\n');

  const events: PrdEvent[] = [];

  for (const section of PRD_EVENT_SECTIONS) {
    const start = lines.findIndex((line) => line.startsWith(`#### ${section}:`));

    expect(start, `the PRD has a ${section} section`).toBeGreaterThan(-1);

    // The section runs to the next `####` heading.
    let end = start + 1;

    while (end < lines.length && !lines[end]?.startsWith('#### ')) {
      end += 1;
    }

    for (const line of lines.slice(start, end)) {
      const numbered = /^\s*(\d+)\.\s+\*\*(.+?)\*\*/.exec(line);

      if (!numbered) {
        continue;
      }

      const number = Number(numbered[1]);

      if (number < 1 || number > 30) {
        continue;
      }

      events.push({
        number,
        title: (numbered[2] ?? '').trim(),
        // The field list is the part after the em dash that separates the
        // title from the fields. Only that part names fields — the title's
        // own parenthetical ("substitute receiver") is a qualifier, not a
        // field.
        prose: (line.slice(line.indexOf('—') + 1) || line).toLowerCase(),
      });
    }
  }

  return events;
}

/**
 * The fields the PRD names for an event.
 *
 * Each matched phrase is consumed from the prose, so a longer phrase wins
 * over the shorter phrase it contains.
 */
function prdFieldsFor(prose: string): readonly PrdField[] {
  let remaining = prose;
  const found: PrdField[] = [];

  for (const [phrase, field] of PRD_FIELD_NAMES) {
    const index = remaining.indexOf(phrase);

    if (index === -1) {
      continue;
    }

    found.push(field);

    // Consume the match, so a shorter phrase inside it does not also match.
    remaining =
      remaining.slice(0, index) +
      ' '.repeat(phrase.length) +
      remaining.slice(index + phrase.length);
  }

  return found;
}

describe('the audit catalog agrees with the frozen PRD', () => {
  const prdEvents = readPrdEvents();
  const schema = readFileSync(SCHEMA_PATH, 'utf8');

  it('parses all thirty numbered events from the PRD', () => {
    // If the PRD's formatting ever changes, this fails loudly rather than
    // silently checking nothing.
    expect(prdEvents).toHaveLength(30);
    expect(prdEvents.map((event) => event.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
  });

  it('gives every catalog entry the number the PRD gives it', () => {
    for (const prdEvent of prdEvents) {
      expect(
        findCatalogEntryByNumber(prdEvent.number),
        `the PRD names event ${prdEvent.number}`,
      ).toBeDefined();
    }
  });

  it('titles every event the way the PRD titles it', () => {
    const mismatches: string[] = [];

    for (const prdEvent of prdEvents) {
      const catalogEntry = findCatalogEntryByNumber(prdEvent.number);

      if (!catalogEntry) {
        mismatches.push(`event ${prdEvent.number}: missing from the catalog`);

        continue;
      }

      // The PRD's title is the event's name. A catalog entry that renames an
      // event contradicts the frozen PRD.
      //
      // The PRD sometimes adds a scope qualifier the catalog drops
      // deliberately — "(Found-side only)", "(Lost-side only)", "(Lost-side)",
      // "(parent/batch event)", "(individual-terminal event)", "(exceptional,
      // Lost-side)". Those qualifiers say *which* side or *which* kind of
      // event, and the catalog's type discriminator carries that meaning
      // instead. The comparison therefore ignores a trailing qualifier in
      // parentheses, but nothing else.
      const prdTitle = prdEvent.title.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const catalogTitle = catalogEntry.description.replace(/\s*\([^)]*\)\s*$/, '').trim();

      if (prdTitle.toLowerCase() !== catalogTitle.toLowerCase()) {
        mismatches.push(
          `event ${prdEvent.number}: PRD says "${prdTitle}", catalog says "${catalogTitle}"`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('carries every field the PRD names for an event', () => {
    const missing: string[] = [];

    for (const prdEvent of prdEvents) {
      const catalogEntry = findCatalogEntryByNumber(prdEvent.number);

      if (!catalogEntry) {
        continue;
      }

      const permitted = new Set(catalogEntry.additionalFields);

      for (const prdField of prdFieldsFor(prdEvent.prose)) {
        // A field is carried if the catalog permits it in the payload, or if
        // it is one of the model's typed columns.
        const carried =
          permitted.has(prdField.field) ||
          (prdField.carrier === 'column' && TYPED_COLUMNS.includes(prdField.field));

        if (!carried) {
          missing.push(
            `event ${prdEvent.number}: the PRD names "${prdField.field}", nothing carries it`,
          );
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('carries every PRD-named field in a place the model actually has', () => {
    // A field carried in a typed column must be a column on `AuditEvent` —
    // otherwise the PRD names a value the model cannot hold.
    const modelBody = schema.slice(
      schema.indexOf('model AuditEvent {'),
      schema.indexOf('model AuditReadLog {'),
    );

    for (const column of TYPED_COLUMNS) {
      expect(modelBody, `AuditEvent has a ${column} column`).toMatch(
        new RegExp(`\\b${column}\\s+\\w+\\??`),
      );
    }
  });

  it('adds no numbered event the PRD does not name', () => {
    const numbered = AUDIT_EVENT_CATALOG.filter((entry) => Number.isInteger(entry.number));
    const prdNumbers = new Set(prdEvents.map((event) => event.number));

    // Every numbered catalog entry is a PRD event, and every PRD event is a
    // numbered catalog entry — the two sets are equal.
    expect(numbered.map((entry) => entry.number).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      [...prdNumbers].sort((a, b) => a - b),
    );
  });

  it('keeps the non-numbered records out of the numbered range', () => {
    const nonNumbered = AUDIT_EVENT_CATALOG.filter((entry) => !Number.isInteger(entry.number));

    // The PRD names four records that carry no numbered identifier: FR-52
    // profile edits, FR-53 administrator report edits, the FR-2
    // registration record, and the FR-36 removal record. FR-31's rule for
    // the set is "additional audit records explicitly required by other
    // requirements", and FR-2 and FR-36 each explicitly require one.
    expect(nonNumbered.map((entry) => entry.type).sort()).toEqual([
      'content.removed_by_administrator',
      'member_profile.edited',
      'registration.submitted',
      'report.edited_by_administrator',
    ]);
  });
});
