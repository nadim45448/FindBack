/**
 * The edit snapshot and lifecycle event suite.
 *
 * **The load-bearing assertions are FR-19's two halves.** The reporter's
 * event carries the changed fields **and** the previous values once the
 * report carries an interaction, and carries the changed fields **alone**
 * before that. The administrator's event always carries both, because
 * FR-53 has no interaction condition.
 *
 * **The distinction is expressed as the presence or absence of the previous
 * values** — not as a flag. A snapshot without previous values is a
 * different *kind of thing* from one with them, and the payload field is a
 * union so a caller cannot supply the wrong shape.
 */

import { describe, expect, it } from 'vitest';

import {
  buildEditOutcome,
  buildReportEditedByAdministratorEvent,
  buildReportEditedByReporterEvent,
  buildReportWithdrawnEvent,
  orderSnapshots,
  REPORTER_EDITABLE_FIELDS,
  snapshotIfChanged,
  type FieldSnapshot,
} from '@/domain/listings';

describe('snapshotIfChanged', () => {
  it('builds a snapshot when the value differs', () => {
    expect(snapshotIfChanged('name', 'Old', 'New')).toEqual({
      field: 'name',
      previousValue: 'Old',
      newValue: 'New',
    });
  });

  it('returns null when the value is the same', () => {
    expect(snapshotIfChanged('name', 'Same', 'Same')).toBeNull();
  });

  it('distinguishes "was not set" from "was empty"', () => {
    // **A report with no exact place has an exact place of `null`.** An edit
    // that sets one must record that the previous value was *absent* —
    // which is different from an empty string, and collapsing the two would
    // make the trail unable to answer "did this field have a value before?".
    const snapshot = snapshotIfChanged('exactPlace', undefined, 'Under the desk');

    expect(snapshot?.previousValue).toBeUndefined();
    expect(snapshot?.newValue).toBe('Under the desk');
  });

  it('records an empty previous value as a set value', () => {
    const snapshot = snapshotIfChanged('exactPlace', '', 'Under the desk');

    expect(snapshot?.previousValue).toBe('');
  });
});

describe('orderSnapshots', () => {
  it('orders by the editable set, not by the request', () => {
    const snapshots: FieldSnapshot[] = [
      { field: 'description', previousValue: 'a', newValue: 'b' },
      { field: 'name', previousValue: 'c', newValue: 'd' },
      { field: 'category', previousValue: 'e', newValue: 'f' },
    ];

    const ordered = orderSnapshots(snapshots, REPORTER_EDITABLE_FIELDS);

    expect(ordered.map((snapshot) => snapshot.field)).toEqual([
      'name',
      'category',
      'description',
    ]);
  });

  it('produces the same order for the same fields whatever the input order', () => {
    const first: FieldSnapshot[] = [
      { field: 'date', previousValue: 'a', newValue: 'b' },
      { field: 'name', previousValue: 'c', newValue: 'd' },
    ];
    const second: FieldSnapshot[] = [...first].reverse();

    expect(orderSnapshots(first, REPORTER_EDITABLE_FIELDS)).toEqual(
      orderSnapshots(second, REPORTER_EDITABLE_FIELDS),
    );
  });
});

describe('buildEditOutcome', () => {
  it('is Unchanged for an empty snapshot list', () => {
    expect(buildEditOutcome([])).toEqual({ kind: 'Unchanged' });
  });

  it('is Changed for a non-empty snapshot list', () => {
    const snapshots: FieldSnapshot[] = [
      { field: 'name', previousValue: 'a', newValue: 'b' },
    ];

    expect(buildEditOutcome(snapshots)).toEqual({ kind: 'Changed', snapshots });
  });
});

describe('buildReportEditedByReporterEvent', () => {
  const snapshots: FieldSnapshot[] = [
    { field: 'name', previousValue: 'Old name', newValue: 'New name' },
  ];

  it('carries the changed fields alone before an interaction', () => {
    const event = buildReportEditedByReporterEvent({
      reportId: 'report-1',
      reporterId: 'reporter-1',
      snapshots,
      includePreviousValues: false,
    });

    expect(event.type).toBe('report.edited_by_reporter');
    expect(event.payload.changedFieldsSnapshot).toEqual({
      kind: 'FieldsOnly',
      fields: ['name'],
    });
  });

  it('carries the changed fields and the previous values after an interaction', () => {
    const event = buildReportEditedByReporterEvent({
      reportId: 'report-1',
      reporterId: 'reporter-1',
      snapshots,
      includePreviousValues: true,
    });

    expect(event.payload.changedFieldsSnapshot).toEqual({
      kind: 'FieldsWithPreviousValues',
      fields: ['name'],
      previousValues: { name: 'Old name' },
    });
  });

  it('records "was not set" as an absent previous value', () => {
    const event = buildReportEditedByReporterEvent({
      reportId: 'report-1',
      reporterId: 'reporter-1',
      snapshots: [{ field: 'exactPlace', previousValue: undefined, newValue: 'Shelf 3' }],
      includePreviousValues: true,
    });

    const snapshot = event.payload.changedFieldsSnapshot;

    expect(snapshot.kind).toBe('FieldsWithPreviousValues');

    if (snapshot.kind === 'FieldsWithPreviousValues') {
      expect(Object.keys(snapshot.previousValues)).toEqual(['exactPlace']);
      expect(snapshot.previousValues['exactPlace']).toBeUndefined();
    }
  });
});

describe('buildReportEditedByAdministratorEvent', () => {
  it('always carries the previous values — FR-53 has no interaction condition', () => {
    const event = buildReportEditedByAdministratorEvent({
      reportId: 'report-1',
      administratorId: 'admin-1',
      snapshots: [{ field: 'category', previousValue: 'Wallet', newValue: 'Other' }],
    });

    expect(event.type).toBe('report.edited_by_administrator');
    expect(event.payload).toEqual({
      changedFields: ['category'],
      previousValues: { category: 'Wallet' },
    });
  });
});

describe('buildReportWithdrawnEvent', () => {
  it('fires event 9 with previousFoundStatus for a Found report', () => {
    const event = buildReportWithdrawnEvent({
      reportId: 'report-1',
      reporterId: 'reporter-1',
      type: 'Found',
      previousStatus: 'Claim Requested',
    });

    expect(event.type).toBe('report.found_withdrawn_by_reporter');
    expect(event.payload).toEqual({ previousFoundStatus: 'Claim Requested' });
  });

  it('fires event 23 with previousLostStatus for a Lost report', () => {
    const event = buildReportWithdrawnEvent({
      reportId: 'report-1',
      reporterId: 'reporter-1',
      type: 'Lost',
      previousStatus: 'Verification Pending',
    });

    expect(event.type).toBe('report.lost_withdrawn_by_reporter');
    expect(event.payload).toEqual({ previousLostStatus: 'Verification Pending' });
  });
});
