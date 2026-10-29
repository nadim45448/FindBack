/**
 * The editable-field whitelist suite.
 *
 * **The whitelist is the bolt's closed field set, and this suite proves it
 * is closed.** FR-53 names exactly eight things an administrator may change
 * and exactly what they may not; FR-9 names the reporter's seven. A field
 * that is neither is **not editable**, because "not editable" is the safe
 * default for a capability that can rewrite a report other people have acted
 * on.
 *
 * **The two sets differ by exactly one field.** The administrator's set adds
 * `imageReplacement`, because FR-53 names image replacement among the
 * editable things and FR-9 does not — the reporter's image attachment is
 * bolt `010`'s. Everything else is shared, and the suite asserts that
 * directly rather than asserting two lists and hoping.
 *
 * **These predicates are the only gate.** Both edit services call them
 * instead of keeping their own copy of the list, so the whitelist has one
 * implementation point. The suite therefore tests the predicates *as the
 * gate*, not as a convenience helper.
 */

import { describe, expect, it } from 'vitest';

import {
  ADMINISTRATOR_EDITABLE_FIELDS,
  isAdministratorEditable,
  isChangeKey,
  isReporterEditable,
  NON_EDITABLE_REPORT_FIELDS,
  REPORTER_EDITABLE_FIELDS,
} from './report-editable-fields';

describe('the reporter\'s editable set', () => {
  it('names the seven FR-9 content fields', () => {
    expect(REPORTER_EDITABLE_FIELDS).toEqual([
      'name',
      'category',
      'description',
      'date',
      'campusArea',
      'exactPlace',
      'identifyingDetails',
    ]);
  });

  it('does not include the image replacement', () => {
    // **FR-9 does not name image replacement.** The reporter's image
    // attachment is bolt `010`'s (story 013), and this bolt does not build
    // it.
    expect(REPORTER_EDITABLE_FIELDS).not.toContain('imageReplacement');
  });

  it('accepts every field on its own list', () => {
    for (const field of REPORTER_EDITABLE_FIELDS) {
      expect(isReporterEditable(field)).toBe(true);
    }
  });

  it('refuses the three fields no edit may change', () => {
    for (const field of NON_EDITABLE_REPORT_FIELDS) {
      expect(isReporterEditable(field)).toBe(false);
    }
  });

  it('refuses a field it has never heard of', () => {
    // **An unknown field is refused, not ignored.** "Not editable" is the
    // safe default; a silently ignored field is a lie about what changed.
    expect(isReporterEditable('somethingElse')).toBe(false);
    expect(isReporterEditable('')).toBe(false);
  });
});

describe('the administrator\'s editable set', () => {
  it('names the eight FR-53 fields', () => {
    expect(ADMINISTRATOR_EDITABLE_FIELDS).toEqual([
      'name',
      'category',
      'description',
      'date',
      'campusArea',
      'exactPlace',
      'identifyingDetails',
      'imageReplacement',
    ]);
  });

  it('is the reporter\'s set plus exactly the image replacement', () => {
    // **The difference is asserted, not assumed.** Two lists that are
    // written separately would agree today and drift tomorrow.
    const reporter = new Set<string>(REPORTER_EDITABLE_FIELDS);
    const administrator = new Set<string>(ADMINISTRATOR_EDITABLE_FIELDS);

    expect([...administrator].filter((field) => !reporter.has(field))).toEqual([
      'imageReplacement',
    ]);
    expect([...reporter].filter((field) => !administrator.has(field))).toEqual([]);
  });

  it('accepts every field on its own list', () => {
    for (const field of ADMINISTRATOR_EDITABLE_FIELDS) {
      expect(isAdministratorEditable(field)).toBe(true);
    }
  });

  it('refuses the three fields no edit may change', () => {
    for (const field of NON_EDITABLE_REPORT_FIELDS) {
      expect(isAdministratorEditable(field)).toBe(false);
    }
  });

  it('refuses a field it has never heard of', () => {
    expect(isAdministratorEditable('somethingElse')).toBe(false);
    expect(isAdministratorEditable('')).toBe(false);
  });

  it('does not accept the fields FR-53 blocks that belong to other modules', () => {
    // **FR-53's blocked list is longer than this bolt's reach.** Claim
    // content, Recovery Response content, audit-trail entries, Returned-
    // confirmation fields, and substitute-receiver fields belong to other
    // modules — so the only thing this suite can assert is that the
    // administrator's edit has no door to them: none of their names is on
    // the whitelist.
    for (const field of [
      'claimReason',
      'recoveryResponseBody',
      'auditEntry',
      'returnedConfirmation',
      'substituteReceiverId',
    ]) {
      expect(isAdministratorEditable(field)).toBe(false);
    }
  });
});

describe('the change key set', () => {
  it('is the reporter\'s content set', () => {
    // **The change map carries columns, not operations.** The image is
    // editable by an administrator, but it is an operation — it travels as
    // its own request member, so it is not a key in the change map.
    for (const field of REPORTER_EDITABLE_FIELDS) {
      expect(isChangeKey(field)).toBe(true);
    }
  });

  it('refuses the image replacement as a change key', () => {
    // **The two questions are separate.** "May an administrator change the
    // image?" is yes. "May the image be a key in the change map?" is no.
    // Collapsing them would either refuse the image outright or accept a
    // key that is then dropped on the floor.
    expect(isChangeKey('imageReplacement')).toBe(false);
    expect(isAdministratorEditable('imageReplacement')).toBe(true);
  });

  it('refuses the three fields no edit may change', () => {
    for (const field of NON_EDITABLE_REPORT_FIELDS) {
      expect(isChangeKey(field)).toBe(false);
    }
  });

  it('refuses a field it has never heard of', () => {
    expect(isChangeKey('somethingElse')).toBe(false);
    expect(isChangeKey('')).toBe(false);
  });
});
