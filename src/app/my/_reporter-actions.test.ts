/**
 * The reporter's action plan, derived from the FR-39 projection — bolt `014`,
 * story 005.
 *
 * **This is the test for the module that turns a projection into a plan.**
 *
 * The plan itself is the domain's — `planReporterActions` owns the
 * interlocks between Edit, Delete, and Withdraw. What this module adds is
 * the **derivation**: it reads the projection and supplies the domain's
 * facts, and it decides *whether the viewer is the reporter at all*.
 *
 * ## The claim under test
 *
 * **The owner column is the structural evidence that the viewer is the
 * reporter.** The projection carries no `reporterId` — and it must not,
 * because that would be a field the client could be told about. It carries
 * the *resolved column set*, and the resolver puts the owner column there
 * **by equality of ids**. So `reporterActionPlan` reads the column set, and
 * a viewer who is not the reporter gets `null` — no plan, no actions, and
 * nothing to render.
 */

import { describe, expect, it } from 'vitest';

import {
  fieldSetOf,
  ownerColumnFor,
  type VisibilityProjection,
} from '@/domain/listings';

import { reporterActionPlan } from './_reporter-actions';

/**
 * A projection, as the server hands it over.
 *
 * **The column set is the only thing that varies between the fixtures**
 * below — everything else is held constant so that a test says precisely
 * which column made the difference.
 */
function projection(
  overrides: Partial<VisibilityProjection> = {},
): VisibilityProjection {
  const report = overrides.report ?? {
    id: '11111111-1111-1111-1111-111111111111',
    type: 'Found' as const,
    status: 'Open',
    name: 'Brown leather wallet',
  };

  return {
    reportId: '11111111-1111-1111-1111-111111111111',
    viewerId: '22222222-2222-2222-2222-222222222222',
    columns: ['unrelatedMember'],
    reportFields: fieldSetOf(['summary', 'description']),
    report,
    claims: [],
    recoveryResponses: [],
    threads: [],
    auditTrail: null,
    ...overrides,
  };
}

describe('the reporter action plan', () => {
  it('offers no plan at all to a member who is not the reporter', () => {
    // **A viewer with no owner column gets `null`** — not a plan with
    // everything blocked. There is no such thing as "the reporter's
    // blocked actions" for a member who did not write the report.
    expect(reporterActionPlan(projection())).toBeNull();
  });

  it('offers no plan to a claimant, who holds no owner column', () => {
    const claimed = projection({
      columns: ['unrelatedMember', 'claimant'],
      claims: [
        {
          claimId: '33333333-3333-3333-3333-333333333333',
          status: 'Pending',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    expect(reporterActionPlan(claimed)).toBeNull();
  });

  it('offers the plan to the Found report’s owner', () => {
    const owned = projection({
      columns: ['unrelatedMember', ownerColumnFor('Found')],
    });

    const plan = reporterActionPlan(owned);

    expect(plan).not.toBeNull();
    expect(plan?.edit).toEqual({ kind: 'Permitted' });
    expect(plan?.delete).toEqual({ kind: 'Permitted' });
    expect(plan?.withdraw).toEqual({ kind: 'Permitted' });
    expect(plan?.administratorOnly).toBe(false);
  });

  it('offers the plan to the Lost report’s owner', () => {
    // **The owner column is type-specific.** A Lost report's owner holds
    // `lostReportOwner`, and that is the column the plan looks for — so the
    // type decides which column the module checks.
    const owned = projection({
      columns: ['unrelatedMember', ownerColumnFor('Lost')],
      report: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'Lost',
        status: 'Open',
        name: 'Brown leather wallet',
      },
    });

    const plan = reporterActionPlan(owned);

    expect(plan).not.toBeNull();
    expect(plan?.edit).toEqual({ kind: 'Permitted' });
  });

  it('does not mistake a Found owner column for a Lost owner column', () => {
    // **The type decides which column counts.** A viewer holding
    // `foundReportOwner` on a *Lost* report is not that report's owner —
    // FR-39 splits the owner columns, and no member is ever both.
    const mismatched = projection({
      columns: ['unrelatedMember', 'foundReportOwner'],
      report: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'Lost',
        status: 'Open',
        name: 'Brown leather wallet',
      },
    });

    expect(reporterActionPlan(mismatched)).toBeNull();
  });

  it('blocks Delete, and points at Withdraw, once a Claim exists', () => {
    // **§10.4: "Once a Claim (Found) or RR (Lost) exists, the reporter must
    // use Withdraw instead — hard delete is blocked."** The Claim's status
    // is irrelevant: the deletion decision reads *interaction existence*,
    // not activity.
    const owned = projection({
      columns: ['unrelatedMember', 'foundReportOwner'],
      claims: [
        {
          claimId: '33333333-3333-3333-3333-333333333333',
          status: 'Rejected',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    const plan = reporterActionPlan(owned);

    expect(plan?.delete).toEqual({ kind: 'Blocked', reason: 'InteractionExists' });
    expect(plan?.withdraw).toEqual({ kind: 'Permitted' });
  });

  it('blocks Delete on a Lost report once a Recovery Response exists', () => {
    // **The Lost rule is expressed in terms of Recovery Responses, not
    // Claims** — §10.4 says so in as many words. So a *Claim* on a Lost
    // report does not block the delete, and a *Recovery Response* does.
    const lost = projection({
      columns: ['unrelatedMember', 'lostReportOwner'],
      report: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'Lost',
        status: 'Open',
        name: 'Brown leather wallet',
      },
      claims: [
        {
          claimId: '33333333-3333-3333-3333-333333333333',
          status: 'Pending',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    expect(reporterActionPlan(lost)?.delete).toEqual({ kind: 'Permitted' });

    const withResponse = projection({
      ...lost,
      recoveryResponses: [
        {
          responseId: '44444444-4444-4444-4444-444444444444',
          status: 'Submitted',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    expect(reporterActionPlan(withResponse)?.delete).toEqual({
      kind: 'Blocked',
      reason: 'InteractionExists',
    });
  });

  it('blocks Edit at a terminal status, with the terminal reason', () => {
    const owned = projection({
      columns: ['unrelatedMember', 'foundReportOwner'],
      report: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'Found',
        status: 'Closed',
        name: 'Brown leather wallet',
      },
    });

    const plan = reporterActionPlan(owned);

    expect(plan?.edit).toEqual({ kind: 'Blocked', reason: 'TerminalStatus' });
    // **A terminal report cannot be withdrawn either** — so the withdraw
    // block is terminal too, not "an interaction exists".
    expect(plan?.withdraw).toEqual({ kind: 'Blocked', reason: 'TerminalStatus' });
  });

  it('makes a Match Confirmed Lost workflow administrator-only', () => {
    // **§10.4: "only an Administrator may end the Lost workflow."** The
    // plan says so explicitly, so the surface can say it in plain English
    // rather than offering a button that cannot work.
    const owned = projection({
      columns: ['unrelatedMember', 'lostReportOwner'],
      report: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'Lost',
        status: 'Verification Pending',
        name: 'Brown leather wallet',
      },
      recoveryResponses: [
        {
          responseId: '44444444-4444-4444-4444-444444444444',
          status: 'Match Confirmed',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    const plan = reporterActionPlan(owned);

    expect(plan?.withdraw).toEqual({ kind: 'Blocked', reason: 'MatchConfirmed' });
    expect(plan?.administratorOnly).toBe(true);
  });

  it('blocks Withdraw at Claim Approved on a Found report', () => {
    const owned = projection({
      columns: ['unrelatedMember', 'foundReportOwner'],
      report: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'Found',
        status: 'Claim Approved',
        name: 'Brown leather wallet',
      },
      claims: [
        {
          claimId: '33333333-3333-3333-3333-333333333333',
          status: 'Approved',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    const plan = reporterActionPlan(owned);

    expect(plan?.withdraw).toEqual({ kind: 'Blocked', reason: 'ClaimApproved' });
    // **A `Claim Approved` report is still editable** — only `Returned` and
    // `Closed` block the edit.
    expect(plan?.edit).toEqual({ kind: 'Permitted' });
    // **And it is not the administrator-only case** — that one is the Lost
    // side's `Match Confirmed`.
    expect(plan?.administratorOnly).toBe(false);
  });
});
