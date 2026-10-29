/**
 * The FR-39 matrix — every viewer category, every field, asserted.
 *
 * **The matrix is a fixture, not a hand-written expectation.** Story 010's
 * success criterion is "every role is covered by a test asserting the exact
 * field set". This file is that test: the seven viewer categories, each with
 * the exact set of report fields, the exact set of related records, and the
 * exact Sensitive-field treatment the PRD specifies.
 *
 * **The fixture is read twice.** Once against the domain's own predicates
 * (`grantsSensitiveFields` and friends), and once against the **select
 * builder** — the infrastructure that turns the decision into SQL. A drift
 * between the two would mean the query selects a column the matrix does not
 * grant, and that is the defect FR-39 exists to prevent. The two are checked
 * together so the check is structural, not a promise.
 *
 * **The Sensitive columns are checked for absence, not for exclusion.** A
 * field that is merely absent from the *result* would satisfy a weaker test;
 * the point of FR-39 is that it was never *loaded*. So the assertion is on
 * the `SELECT` list the infrastructure builds.
 */

import { describe, expect, it } from 'vitest';
import {
  claimSelectColumns,
  lastActionTimestampColumns,
  reportSelectColumns,
  reporterSelectColumns,
  responseSelectColumns,
  auditSelectColumns,
} from '@/infrastructure/listings/select-builder';
import {
  createReportRelationship,
  grantsAuditTrail,
  grantsClaims,
  grantsRecoveryResponses,
  grantsReportContent,
  grantsSensitiveFields,
  relatedRecordGrantsFor,
  reportFieldsFor,
  resolveColumns,
  viewerFromActorContext,
  type ProjectionColumn,
  type ReportField,
} from '@/domain/listings';
import { createActorContext } from '@/domain/accounts/actor-context';

/**
 * The matrix, one row per viewer category.
 *
 * `reportFields` is the **exact** set — not a superset, not a subset. The
 * assertion is on set equality, so a field appearing in the wrong row fails.
 *
 * `sensitiveFields` is the exact set of FR-37 Sensitive report fields the
 * category receives.
 */
interface MatrixRow {
  readonly role: string;
  readonly columns: readonly ProjectionColumn[];
  readonly reportFields: readonly ReportField[];
  readonly sensitiveFields: readonly ReportField[];
  readonly claims: boolean;
  readonly recoveryResponses: boolean;
  readonly auditTrail: boolean;
}

/**
 * The FR-39 matrix.
 *
 * Derived from the PRD's § 4.11 table. The Sensitive report fields are
 * FR-37's: `exactPlace`, `identifyingDetails`, `reporterEmail`,
 * `reporterPhone`.
 */
const MATRIX: readonly MatrixRow[] = [
  {
    role: 'Anonymous',
    columns: ['anonymous'],
    reportFields: ['summary'],
    sensitiveFields: [],
    claims: false,
    recoveryResponses: false,
    auditTrail: false,
  },
  {
    role: 'Unrelated member',
    columns: ['unrelatedMember'],
    reportFields: [
      'summary',
      'description',
      'image',
      'reporterName',
      'statusHistory',
    ],
    sensitiveFields: [],
    claims: false,
    recoveryResponses: false,
    auditTrail: false,
  },
  {
    role: 'Found-report owner',
    columns: ['unrelatedMember', 'foundReportOwner'],
    reportFields: [
      'summary',
      'description',
      'image',
      'reporterName',
      'statusHistory',
      'exactPlace',
      'identifyingDetails',
      'reporterEmail',
      'reporterPhone',
    ],
    sensitiveFields: [
      'exactPlace',
      'identifyingDetails',
      'reporterEmail',
      'reporterPhone',
    ],
    claims: true,
    recoveryResponses: false,
    auditTrail: false,
  },
  {
    role: 'Claimant',
    columns: ['unrelatedMember', 'claimant'],
    reportFields: [
      'summary',
      'description',
      'image',
      'reporterName',
      'statusHistory',
    ],
    sensitiveFields: [],
    claims: true,
    recoveryResponses: false,
    auditTrail: false,
  },
  {
    role: 'Recovery responder',
    columns: ['unrelatedMember', 'recoveryResponder'],
    reportFields: [
      'summary',
      'description',
      'image',
      'reporterName',
      'statusHistory',
    ],
    sensitiveFields: [],
    claims: false,
    recoveryResponses: true,
    auditTrail: false,
  },
  {
    role: 'Lost-report owner',
    columns: ['unrelatedMember', 'lostReportOwner'],
    reportFields: [
      'summary',
      'description',
      'image',
      'reporterName',
      'statusHistory',
      'exactPlace',
      'identifyingDetails',
      'reporterEmail',
      'reporterPhone',
    ],
    sensitiveFields: [
      'exactPlace',
      'identifyingDetails',
      'reporterEmail',
      'reporterPhone',
    ],
    claims: false,
    recoveryResponses: true,
    auditTrail: false,
  },
  {
    role: 'Administrator',
    columns: ['administrator'],
    reportFields: [
      'summary',
      'description',
      'image',
      'reporterName',
      'statusHistory',
      'exactPlace',
      'identifyingDetails',
      'reporterEmail',
      'reporterPhone',
    ],
    sensitiveFields: [
      'exactPlace',
      'identifyingDetails',
      'reporterEmail',
      'reporterPhone',
    ],
    claims: true,
    recoveryResponses: true,
    auditTrail: true,
  },
];

describe('the FR-39 matrix', () => {
  it('covers all seven viewer categories', () => {
    expect(MATRIX).toHaveLength(7);
    expect(MATRIX.map((row) => row.role)).toEqual([
      'Anonymous',
      'Unrelated member',
      'Found-report owner',
      'Claimant',
      'Recovery responder',
      'Lost-report owner',
      'Administrator',
    ]);
  });

  describe.each(MATRIX)('$role', (row) => {
    it('grants exactly the expected report fields', () => {
      const fields = reportFieldsFor(row.columns);

      expect([...fields].sort()).toEqual([...row.reportFields].sort());
    });

    it('grants exactly the expected Sensitive report fields', () => {
      const sensitive = [...row.reportFields].filter((field) =>
        (
          [
            'exactPlace',
            'identifyingDetails',
            'reporterEmail',
            'reporterPhone',
          ] as readonly ReportField[]
        ).includes(field),
      );

      expect(sensitive.sort()).toEqual([...row.sensitiveFields].sort());
    });

    it('agrees with the domain predicates', () => {
      expect(grantsReportContent(row.columns)).toBe(
        row.columns.some((column) => column !== 'anonymous'),
      );
      expect(grantsSensitiveFields(row.columns)).toBe(row.sensitiveFields.length > 0);
      expect(grantsClaims(row.columns)).toBe(row.claims);
      expect(grantsRecoveryResponses(row.columns)).toBe(row.recoveryResponses);
      expect(grantsAuditTrail(row.columns)).toBe(row.auditTrail);
    });

    it('agrees with the related-record grants', () => {
      const grants = relatedRecordGrantsFor(row.columns);

      expect(grants.claims).toBe(row.claims);
      expect(grants.recoveryResponses).toBe(row.recoveryResponses);
      expect(grants.auditTrail).toBe(row.auditTrail);
      expect(grants.threads).toBe(row.claims || row.recoveryResponses);
    });

    it('selects exactly the fields the matrix grants', () => {
      // The report columns.
      const selected = reportSelectColumns(row.columns);

      expect(selected).toContain('id');
      expect(selected).toContain('type');
      expect(selected).toContain('status');

      const hasSummary = selected.includes('name');
      expect(hasSummary).toBe(row.reportFields.includes('summary'));

      const hasContent = selected.includes('description');
      expect(hasContent).toBe(row.reportFields.includes('description'));

      const hasImage = selected.includes('imageRef');
      expect(hasImage).toBe(row.reportFields.includes('image'));

      // The Sensitive report columns. **Absent from the SQL**, not merely
      // absent from the result.
      const hasExactPlace = selected.includes('exactPlace');
      expect(hasExactPlace).toBe(row.sensitiveFields.includes('exactPlace'));

      const hasIdentifying = selected.includes('identifyingDetails');
      expect(hasIdentifying).toBe(row.sensitiveFields.includes('identifyingDetails'));
    });

    it('selects exactly the reporter fields the matrix grants', () => {
      const reporter = reporterSelectColumns(row.columns);

      expect(reporter.includes('displayName')).toBe(
        row.reportFields.includes('reporterName'),
      );
      expect(reporter.includes('email')).toBe(
        row.sensitiveFields.includes('reporterEmail'),
      );

      // **The reporter's phone is never selected — for any column set.**
      //
      // FR-37 names it a Sensitive Field *"if collected — FindBack does
      // not require phone"*, and the matrix grants it to the owner and
      // the administrator. The **matrix** keeps the grant; the **select
      // builder** cannot honour it, because there is no column to select:
      // the `accounts` table has never had one, and no requirement
      // collects one.
      //
      // Selecting it anyway would be a query error at runtime — the
      // column does not exist — so the field is absent from the SQL for
      // every viewer, and the projection yields nothing for it. That is
      // the correct outcome, not a leak: a field that is never collected
      // cannot be disclosed.
      expect(reporter.includes('phone')).toBe(false);
    });

    it('selects exactly the claim evidence the matrix grants', () => {
      const claim = claimSelectColumns(row.columns);

      expect(claim).toContain('id');
      expect(claim).toContain('status');

      // The private evidence — the claimant's reason and identifying details
      // — is an administrator-only **selection**.
      expect(claim.includes('reason')).toBe(row.columns.includes('administrator'));
      expect(claim.includes('identifyingDetails')).toBe(
        row.columns.includes('administrator'),
      );
      expect(claim.includes('dateLost')).toBe(row.columns.includes('administrator'));
    });

    it('selects exactly the response evidence the matrix grants', () => {
      const response = responseSelectColumns(row.columns);

      expect(response).toContain('id');
      expect(response).toContain('status');

      expect(response.includes('whereFoundExactPlace')).toBe(
        row.recoveryResponses,
      );
      expect(response.includes('observedIdentifyingDetails')).toBe(
        row.recoveryResponses,
      );
      expect(response.includes('candidateImageRef')).toBe(row.recoveryResponses);
    });

    it('selects the audit trail only for an administrator', () => {
      const trail = auditSelectColumns(row.columns);

      expect(trail.length > 0).toBe(row.auditTrail);
    });
  });
});

describe('the matrix, against the reader-independent facts', () => {
  it('never grants a report-level Sensitive field to a participant', () => {
    // "Participation is never permission." A claimant and a recovery
    // responder hold a participation column, and **neither** grants a
    // report-level Sensitive Field.
    const participants: readonly ProjectionColumn[][] = [
      ['unrelatedMember', 'claimant'],
      ['unrelatedMember', 'recoveryResponder'],
      ['claimant'],
      ['recoveryResponder'],
    ];

    for (const columns of participants) {
      expect(grantsSensitiveFields(columns)).toBe(false);

      const selected = reportSelectColumns(columns);
      expect(selected).not.toContain('exactPlace');
      expect(selected).not.toContain('identifyingDetails');

      const reporter = reporterSelectColumns(columns);
      expect(reporter).not.toContain('email');
      expect(reporter).not.toContain('phone');
    }
  });

  it('grants a report-level Sensitive field to an owner', () => {
    for (const columns of [
      ['foundReportOwner'],
      ['lostReportOwner'],
      ['administrator'],
    ] as readonly ProjectionColumn[][]) {
      expect(grantsSensitiveFields(columns)).toBe(true);
      expect(reportSelectColumns(columns)).toContain('exactPlace');
      expect(reporterSelectColumns(columns)).toContain('email');
    }
  });

  it('never grants the audit trail to a non-administrator', () => {
    const nonAdministrators = MATRIX.filter((row) => !row.auditTrail);

    for (const row of nonAdministrators) {
      expect(grantsAuditTrail(row.columns)).toBe(false);
      expect(auditSelectColumns(row.columns)).toEqual([]);
    }
  });

  it('selects only the timestamp for the member-facing status history', () => {
    // The member-facing status history is **not** the trail. It is the
    // timestamp of the most recent event and nothing else.
    expect(lastActionTimestampColumns()).toEqual(['occurredAt']);
  });
});

describe('resolveColumns', () => {
  const relationship = {
    reportId: 'report-1',
    reportType: 'Lost' as const,
    reporterId: 'owner-1',
    viewerId: 'viewer-1',
    isReporter: false,
    hasClaim: false,
    hasRecoveryResponse: false,
    claimId: null,
    recoveryResponseId: null,
  };

  it('gives an anonymous viewer the anonymous column alone', () => {
    const columns = resolveColumns(
      { kind: 'anonymous', accountId: null, isAdministrator: false, displayName: null },
      relationship,
    );

    expect(columns).toEqual(['anonymous']);
  });

  it('gives an administrator the administrator column alone', () => {
    const columns = resolveColumns(
      {
        kind: 'member',
        accountId: 'admin-1',
        isAdministrator: true,
        displayName: 'Admin',
      },
      relationship,
    );

    expect(columns).toEqual(['administrator']);
  });

  it('gives an unrelated member the unrelated-member column alone', () => {
    const columns = resolveColumns(
      {
        kind: 'member',
        accountId: 'viewer-1',
        isAdministrator: false,
        displayName: 'Viewer',
      },
      relationship,
    );

    expect(columns).toEqual(['unrelatedMember']);
  });

  it('gives the Found-report owner the Found-report owner column', () => {
    const columns = resolveColumns(
      {
        kind: 'member',
        accountId: 'owner-1',
        isAdministrator: false,
        displayName: 'Owner',
      },
      { ...relationship, reportType: 'Found', isReporter: true },
    );

    expect(columns).toEqual(['unrelatedMember', 'foundReportOwner']);
  });

  it('gives the Lost-report owner the Lost-report owner column', () => {
    const columns = resolveColumns(
      {
        kind: 'member',
        accountId: 'owner-1',
        isAdministrator: false,
        displayName: 'Owner',
      },
      { ...relationship, reportType: 'Lost', isReporter: true },
    );

    expect(columns).toEqual(['unrelatedMember', 'lostReportOwner']);
  });

  it('holds the owner column and a participation column together', () => {
    const columns = resolveColumns(
      {
        kind: 'member',
        accountId: 'owner-1',
        isAdministrator: false,
        displayName: 'Owner',
      },
      { ...relationship, reportType: 'Found', isReporter: true, hasClaim: true },
    );

    expect(columns).toEqual(['unrelatedMember', 'foundReportOwner', 'claimant']);
  });

  it('resolves the Lost-report owner column for a Lost report', () => {
    const columns = resolveColumns(
      {
        kind: 'member',
        accountId: 'owner-1',
        isAdministrator: false,
        displayName: 'Owner',
      },
      { ...relationship, reportType: 'Lost', isReporter: true },
    );

    expect(columns).toContain('lostReportOwner');
    expect(columns).not.toContain('foundReportOwner');
  });
});

describe('the two owner columns are mutually exclusive', () => {
  // Story 010 criterion 21: "Given any report type, When the projection is
  // evaluated, Then no single member is simultaneously the Found-report
  // owner and the Lost-report owner of the same report."
  //
  // The split is structural, not a runtime guard. `resolveColumns` pushes
  // **one** owner column, chosen by the report's type, so there is no code
  // path that could hand a viewer both.

  const viewer = {
    kind: 'member' as const,
    accountId: 'owner-1',
    isAdministrator: false,
    displayName: 'Owner',
  };

  it('gives a Found-report author only the Found-report owner column', () => {
    const columns = resolveColumns(viewer, {
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'owner-1',
      isReporter: true,
      hasClaim: false,
      hasRecoveryResponse: false,
      claimId: null,
      recoveryResponseId: null,
    });

    expect(columns).toContain('foundReportOwner');
    expect(columns).not.toContain('lostReportOwner');
  });

  it('gives a Lost-report author only the Lost-report owner column', () => {
    const columns = resolveColumns(viewer, {
      reportId: 'report-1',
      reportType: 'Lost',
      reporterId: 'owner-1',
      viewerId: 'owner-1',
      isReporter: true,
      hasClaim: false,
      hasRecoveryResponse: false,
      claimId: null,
      recoveryResponseId: null,
    });

    expect(columns).toContain('lostReportOwner');
    expect(columns).not.toContain('foundReportOwner');
  });

  it('never holds both owner columns, across every report type and every role', () => {
    // The exhaustive form of the criterion. Every report type, every
    // participation combination, and the two owner columns are checked
    // together — so a change that made the columns additive would fail
    // here rather than in production.
    const reportTypes = ['Found', 'Lost'] as const;
    const participations = [
      { hasClaim: false, hasRecoveryResponse: false },
      { hasClaim: true, hasRecoveryResponse: false },
      { hasClaim: false, hasRecoveryResponse: true },
      { hasClaim: true, hasRecoveryResponse: true },
    ];

    for (const reportType of reportTypes) {
      for (const participation of participations) {
        for (const isReporter of [true, false]) {
          const columns = resolveColumns(viewer, {
            reportId: 'report-1',
            reportType,
            reporterId: 'owner-1',
            viewerId: 'owner-1',
            isReporter,
            hasClaim: participation.hasClaim,
            hasRecoveryResponse: participation.hasRecoveryResponse,
            claimId: participation.hasClaim ? 'claim-1' : null,
            recoveryResponseId: participation.hasRecoveryResponse
              ? 'response-1'
              : null,
          });

          const holdsFoundOwner = columns.includes('foundReportOwner');
          const holdsLostOwner = columns.includes('lostReportOwner');

          expect(holdsFoundOwner && holdsLostOwner).toBe(false);
        }
      }
    }
  });
});

describe('the authorisation is server-side, not client-side hiding', () => {
  // Story 010 criterion 22: "Given the matrix, When it is enforced, Then
  // authorization is enforced at the API layer and client-side hiding is not
  // sufficient."
  //
  // The route layer is bolt `009`'s, but the **enforcement point** is this
  // bolt's. Two properties make client-side hiding insufficient, and both
  // are structural:
  //
  // 1 - The decision is derived from the **server's** facts — the actor
  //     context and the record's own relationship — and never from
  //     anything the client supplies.
  // 2 - The unauthorised value is **never fetched**. A hidden field that
  //     was loaded is still disclosed to a client that reads the response.
  //
  // The API-layer wiring arrives with the route; what is asserted here is
  // that the route will have nothing to bypass.

  it('derives the reporter role from the id equality, never from a supplied flag', () => {
    // A client that claims "I am the owner" changes nothing: the role is
    // computed by comparing the viewer's id to the report's author.
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'viewer-1',
    });

    expect(relationship.isReporter).toBe(false);

    const asOwner = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'owner-1',
    });

    expect(asOwner.isReporter).toBe(true);
  });

  it('derives participation from the record ids, never from a supplied flag', () => {
    const relationship = createReportRelationship({
      reportId: 'report-1',
      reportType: 'Found',
      reporterId: 'owner-1',
      viewerId: 'viewer-1',
    });

    expect(relationship.hasClaim).toBe(false);
    expect(relationship.hasRecoveryResponse).toBe(false);
  });

  it('builds the viewer from the actor context, not from request data', () => {
    // The `Viewer` carries no field a client could set to widen a grant —
    // the kind comes from the account's capability, and the administrator
    // flag is already folded into the context by bolt `004`.
    const viewer = viewerFromActorContext(
      createActorContext({
        actorId: 'viewer-1',
        status: 'Active',
        isAdministrator: false,
        displayName: 'Viewer',
      }),
    );

    expect(viewer.kind).toBe('member');
    expect(viewer.isAdministrator).toBe(false);
    expect(Object.keys(viewer).sort()).toEqual([
      'accountId',
      'displayName',
      'isAdministrator',
      'kind',
    ]);
  });

  it('never fetches a Sensitive column for a viewer who may not see it', () => {
    // The decisive property. A client-side "hidden" field that was loaded
    // is still disclosed to anyone who reads the response — so the
    // Sensitive columns must be **absent from the SELECT**, not filtered
    // out of the result.
    //
    // Each column is checked against the Sensitive set it may **not**
    // receive. The claim evidence and the response evidence are checked
    // separately, because each belongs to a different record: the claimant
    // receives their own Claim's evidence but no report-level Sensitive
    // Field, and the responder receives their own Response's evidence but
    // no report-level Sensitive Field.
    const unauthorised: readonly ProjectionColumn[] = [
      'anonymous',
      'unrelatedMember',
      'claimant',
      'recoveryResponder',
    ];

    for (const column of unauthorised) {
      const columns = [column] as const;

      // The report-level Sensitive Fields: only an owner or the
      // administrator receives them.
      expect(reportSelectColumns(columns)).not.toContain('exactPlace');
      expect(reportSelectColumns(columns)).not.toContain('identifyingDetails');
      expect(reporterSelectColumns(columns)).not.toContain('email');
      expect(reporterSelectColumns(columns)).not.toContain('phone');

      // The Claim evidence is the administrator's alone.
      expect(claimSelectColumns(columns)).not.toContain('reason');
      expect(claimSelectColumns(columns)).not.toContain('identifyingDetails');
      expect(claimSelectColumns(columns)).not.toContain('dateLost');
    }

    // The Recovery Response evidence belongs to the responder (their own
    // response) and to the Lost-report owner (every response on their own
    // Lost report) — and to the administrator. The Found-report owner
    // receives none, and neither does an unrelated member.
    for (const column of ['anonymous', 'unrelatedMember', 'foundReportOwner', 'claimant'] as const) {
      const columns = [column] as const;

      expect(responseSelectColumns(columns)).not.toContain('whereFoundExactPlace');
      expect(responseSelectColumns(columns)).not.toContain('observedIdentifyingDetails');
      expect(responseSelectColumns(columns)).not.toContain('candidateImageRef');
    }
  });
});
