---
unit: 002-reporting-and-listings
bolt: 006-reporting-visibility
stage: test
status: complete
updated: 2026-10-28T20:10:00Z
---

# Test Report - Reporting and Listings

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit | 1005 | 0 | 0 | 94.19% |
| Integration | 0 | 0 | 0 | n/a |
| Security | 42 | 0 | 0 | n/a |
| Performance | 0 | 0 | 0 | n/a |
| **Total** | 1005 | 0 | 0 | **94.19%** |

**Integration tests are deferred to bolt `007` by the owner-confirmed
`006`/`007` split.** Bolt `006` ships the domain and application layers
complete and fully tested, plus the readers written and unit-tested against
the generated SQL string; bolt `007` creates the tables and integration-tests
the readers `006` left behind. No test in this report touches a live
database, and no test claims to.

The "Security" row counts the assertions in this bolt's suites that bear on
authorisation and disclosure — the "never loaded" assertions, the
"participation grants nothing" regressions, the parameterisation assertion,
and the mutual-exclusivity invariant. They are unit tests, counted here
because they are the security tests this bolt's scope admits; they are
**also** included in the Unit row, so the Total row is the honest number.

## Acceptance Criteria Validation

Story `010-visibility-matrix-by-actor` — 22 criteria, all met.

| # | Criterion (abbreviated) | Status | Backing test |
|---|-------------------------|--------|--------------|
| 1 | A Sensitive Field is **never loaded** for an unauthorised viewer, not filtered after the fact | ✅ | `never-loaded.test.ts` — the Sensitive physical name must not appear in the query text for `anonymous`, `unrelatedMember`, `claimant`, `recoveryResponder` |
| 2 | An anonymous viewer receives only the FR-38 public summary fields | ✅ | matrix row `Anonymous` → `reportFields: ['summary']`; `reportSelectColumns(['anonymous'])` selects base + summary only; the service refuses an anonymous actor and issues no query |
| 3 | An unrelated member receives summary + description, image, reporter display name, and no Sensitive Fields, no Claim content, no Response content, no thread content | ✅ | matrix row `Unrelated member`; service test "receives the content fields and no Sensitive Field" and "receives no Claims, no Responses, and no trail" |
| 4 | A Found-report author receives exact place, identifying details, and reporter email/phone | ✅ | matrix row `Found-report owner` → `sensitiveFields: ['exactPlace','identifyingDetails','reporterEmail','reporterPhone']`; service test "receives the Sensitive Fields" |
| 5 | A Lost-report author receives the same owner fields **and every Recovery Response and every per-Response thread** | ✅ | matrix row `Lost-report owner` → `recoveryResponses: true`; service test "receives every Recovery Response on their own report" and "receives the responder-supplied fields" |
| 6 | The Lost-report owner column governs **all** owner-level visibility, including Recovery-Response-specific fields | ✅ | `grantsRecoveryResponses` grants on `lostReportOwner`; `responseSelectColumns` includes the Sensitive set on that column; the matrix test asserts the select builder and the domain predicate agree |
| 7 | A claimant receives their own Claim with reason, identifying details, date lost, current status, and audit-light history, plus the per-Claim thread | ✅ | service test "receives their own Claim evidence" and "receives the thread on their own Claim only"; `row-mapping.test.ts` maps `audit_light_history` to `{status, at}` |
| 8 | A claimant receives **no** report exact place, report identifying details, or reporter email/phone | ✅ | matrix test "never grants a report-level Sensitive field to a participant"; service test "receives no report-level Sensitive Field"; `reportSelectColumns(['claimant'])` omits both |
| 9 | A Found-report owner sees that a Claim exists and its thread, but not the claimant's reason or identifying details | ✅ | service test "receives the Claims on their own report, without the private evidence"; `claimSelectColumns(['foundReportOwner'])` omits `reason` |
| 10 | A claimant receives no other claimant's identifying details, reasons, or threads | ✅ | Claim projector "scopes the visible Claim ids to the claimant"; thread projector "drops a thread whose parent is not in the scoped set" |
| 11 | A recovery responder receives only their own Recovery Response, with all its fields, and the thread scoped to it | ✅ | service test "receives only their own Recovery Response"; matrix row `Recovery responder` → `recoveryResponses: true` |
| 12 | A recovery responder receives no other responder's responses, fields, or threads | ✅ | Recovery Response projector "scopes the visible Response ids to the responder"; matrix test "never grants a report-level Sensitive field to a participant" |
| 13 | An administrator receives the full set: all Claim content, all Response content, all thread content, and the full audit trail | ✅ | matrix row `Administrator` (every cell `Y`); service tests "receives every Claim, with the evidence", "receives the trail"; `auditSelectColumns(['administrator'])` returns the full event |
| 14 | An administrator receives per-Recovery-Response threads on a Lost report they do not own | ✅ | the administrator column is resolved **alone** and grants every response; the thread scope is the parent's scope, so the administrator's scope is every response |
| 15 | Any party receives the member-facing status and last-action timestamp for the related report | ✅ | service test "carries the current status and the last-action timestamp"; `lastActionTimestampColumns()` returns exactly `['occurredAt']` |
| 16 | No member — reporter, claimant, responder, or Lost-report owner — receives the full audit trail | ✅ | matrix test "never grants the audit trail to a non-administrator"; the trail reader **refuses before the query** (`client.queries` has length 0) |
| 17 | Submitting a Claim unlocks no visibility beyond the Claimant column | ✅ | service test "participation grants nothing — receives no report-level Sensitive Field" **and** "is handed a column set that grants no Sensitive Field" — asserted from both the projection's side and the reader's side |
| 18 | Submitting a Recovery Response unlocks no visibility beyond the Recovery responder column | ✅ | service test "the recovery responder — participation grants nothing — receives no report-level Sensitive Field"; `grantsSensitiveFields` grants only on the owner and administrator columns |
| 19 | Thread participation grants no access to the claimant's reason, identifying details, or private ownership evidence | ✅ | the thread reader derives nothing from the column set (`_columns`), and the thread columns carry no evidence; the thread projector "never widens the parent set" |
| 20 | The owning column follows the report type — Found-report owner for a Found report, Lost-report owner for a Lost report | ✅ | matrix test "resolves the Lost-report owner column for a Lost report" and "gives the Found-report owner the Found-report owner column"; `ownerColumnFor` is a total function on the report type |
| 21 | No member is simultaneously the Found-report owner and the Lost-report owner of the same report | ✅ | **new in Stage 5** — `visibility-matrix.test.ts` § "the two owner columns are mutually exclusive": the exhaustive form checks both report types × all four participation combinations × both reporter states, asserting the two owner columns are never held together |
| 22 | Authorisation is enforced at the API layer; client-side hiding is not sufficient | ✅ | **new in Stage 5** — `visibility-matrix.test.ts` § "the authorisation is server-side, not client-side hiding". The enforcement point is this bolt's; the route layer is bolt `009`'s. Asserted structurally: the reporter role is derived from the id equality and never from a supplied flag; participation is derived from the record ids and never from a supplied flag; the `Viewer` is built from the `ActorContext` and carries no client-settable field; and the unauthorised Sensitive column is **absent from the SELECT**, so there is nothing for a client-side rule to hide |

**22 of 22 met.**

## Unit Tests

**1005 tests across 61 files, all passing.** 190 of them belong to this
bolt, in five suites.

### `src/domain/listings/visibility-matrix.test.ts` — 82 tests

The FR-39 matrix as a **fixture-driven table test**. One row per viewer
category, each asserting:

- the **exact** report field set (set equality — a field in the wrong row
  fails);
- the **exact** Sensitive-field treatment;
- agreement with the domain's own predicates (`grantsSensitiveFields`,
  `grantsClaims`, `grantsRecoveryResponses`, `grantsAuditTrail`,
  `grantsReportContent`);
- agreement with `relatedRecordGrantsFor` and `reportFieldsFor`;
- the **select builder's** report columns, reporter columns, Claim evidence,
  Response evidence, and audit-trail selection.

The fixture is read twice — once against the domain predicates and once
against the infrastructure's select builder — so the two cannot drift. That
is the whole point of the shared-artefact design: a drift between the
decision and the SQL would mean the query selects a column the matrix does
not grant, and that is the defect FR-39 exists to prevent.

### `src/domain/listings/visibility-domain.test.ts` — 36 tests

The viewer, the relationship, and the five projectors directly. Notably:

- `isReporter` is **derived** from the id equality, never supplied;
- a row carrying more than was authorised **cannot widen** the projection;
- an absent value leaves the key **off** the projection entirely — never
  `null` — so "this field does not apply to you" stays distinguishable from
  "this field exists and is empty";
- the thread projector **never widens** the parent set.

### `src/application/listings/report-visibility-service.test.ts` — 28 tests

The service against port fakes that **record the column set and scope they
were handed**. The sequence is the mechanism, and the tests assert it:
the columns are resolved *before* any content is read, so the reads are
shaped by them.

The **"participation grants nothing"** regression is asserted **from both
sides** — the participant's projection carries no Sensitive Field, *and*
the reader was handed a column set that grants none. One side alone would
be a weaker test: a projection that dropped the field would pass, and a
reader that filtered it after loading would pass.

### `src/infrastructure/listings/never-loaded.test.ts` — 24 tests

The "never loaded" assertions, on the **generated SQL**. A Sensitive column's
physical name must not appear in the query text for a viewer who may not see
it.

**The assertion is on the SQL, not on the response.** A response-level test
would still pass if the value were loaded and dropped — which is precisely
what FR-39 forbids.

Also asserted: the `accounts` join is issued only when a reporter field is
granted; the last-action subquery selects **only** `occurred_at` and never
the event row (an event row carries the actor and the event type, which is
trail content — FR-32); the relationship query uses `LEFT JOIN` and carries
no report content; an empty scope issues **no query at all**; and the trail
is refused **before** the query is issued.

### `src/infrastructure/listings/row-mapping.test.ts` — 20 tests

**New in Stage 5.** The other half of the reader's contract: how a row comes
back out. The SQL shape is asserted in `never-loaded.test.ts`; this file
asserts the mapping.

The distinction under test is **`undefined` versus `null`**. A reader maps
the columns it *selected*: a column that was not selected is absent from the
row — `undefined` — and the reader must leave the key **off** the result. A
column that was selected but holds no value is `null`, and the reader carries
the `null` through. Conflating the two would mean a selected-but-empty
column silently disappears, and the projection could no longer tell "this
field exists and is empty" from "this field does not apply to you".

Covers all five readers: the full row, the selected-but-empty row, the
unselected-column case, the empty audit-light history, the non-numbered trail
event, the relationship facts, the non-`Found` type defaulting to `Lost`,
and the empty-scope early return.

## Integration Tests

**None — deferred to bolt `007` by the owner-confirmed `006`/`007` split.**

Bolt `006` ships the domain and application layers complete and fully
tested, plus the readers written and unit-tested against the generated SQL
string. Bolt `007` creates the `reports` / `claims` / `recovery_responses` /
`thread_messages` / `audit_events` / `accounts` tables and integration-tests
the readers `006` left behind.

**The obligation this creates for bolt `007`**, recorded in the construction
log: the existing `AuditEvent` and `Account` tables predate the
`coding-standards.md` naming convention and carry no `@@map`, so their
physical names are currently `"AuditEvent"` and `"Account"`. Bolt `007` must
add the `@@map` annotations so the raw SQL the visibility readers issue
reaches the tables the standards name.

## Security Tests

**42 assertions across the five suites**, all passing.

| Property | Where asserted |
|----------|-----------------|
| A Sensitive Field is absent from the **query**, not filtered from the response | `never-loaded.test.ts` — the physical name must not appear in the query text |
| The report-level Sensitive Fields are absent for every non-owner, non-administrator column | `visibility-matrix.test.ts` — report, reporter, Claim, and Response selects each checked against the Sensitive set it may not receive |
| The Claim evidence is the administrator's alone | `visibility-matrix.test.ts`, `never-loaded.test.ts` |
| The audit trail is administrator-only, and is **refused before the query** | `never-loaded.test.ts` — `client.queries` has length 0 for a non-administrator |
| The member-facing status history selects **only** the timestamp | `never-loaded.test.ts`, `visibility-matrix.test.ts` — no `actor_id`, no `event_type`, no `metadata` |
| The reporter role is **derived**, never client-asserted | `visibility-domain.test.ts`, `visibility-matrix.test.ts` |
| Participation is **derived from the record ids**, never client-asserted | `visibility-matrix.test.ts` |
| The `Viewer` is built from the `ActorContext`, and carries no client-settable field | `visibility-matrix.test.ts` |
| The two owner columns are **mutually exclusive** | `visibility-matrix.test.ts` — exhaustive over report type × participation × reporter state |
| The scope is **bound, never interpolated** | `row-mapping.test.ts` — a report id of `report-1'; DROP TABLE reports; --` appears in `queries[0].values` and **not** in `queries[0].text` |
| An empty scope issues **no query** | `never-loaded.test.ts` |
| The relationship query uses `LEFT JOIN`, so report existence never depends on the viewer's relationships | `never-loaded.test.ts` |

### One security-relevant nuance, recorded deliberately

The **Claim's** `reason` and `identifyingDetails` are FR-37 Sensitive Fields,
so they are absent for the Found-report owner — who sees that a Claim
exists, its status, and its thread, but never the private evidence. This is
what FR-39's "the administrator evaluates private ownership evidence; the
finder does not" requires, and it is the sharpest edge in the matrix.

## Performance Tests

**Not run — out of scope for this bolt.**

The bolt adds no route and no UI; the projection has no page yet (bolt
`009` consumes the service, bolt `012` builds the web surface). There is
nothing to measure end to end, and a benchmark against a synthetic fixture
would assert a number the real workload never produces. The one property
that *is* performance-relevant here is structural and is asserted: the
Sensitive columns are absent from the `SELECT`, so the saving is real
rather than cosmetic — and the `accounts` join is not issued at all when no
reporter field is granted.

## Coverage Report

| Layer | Lines | Branches | Functions | Statements |
|-------|-------|----------|-----------|------------|
| `src/domain/listings` | **95.07%** | 95.39% | 87.17% | 94.7% |
| `src/application/listings` | **90%** | 92.3% | 100% | 90% |
| `src/application/listings/ports` | 0% | 0% | 0% | 0% |
| `src/infrastructure/listings` | **99.14%** | 97.61% | 100% | 99.16% |
| **All files** | **94.19%** | 91.52% | 96.53% | 94.08% |

**The floor is 80%. All three bolt layers clear it.**

`src/application/listings/ports` reads 0% because those files are
**type-only interfaces** — `AuditTrailVisibilityReader`, `ReportVisibilityReader`
and their siblings declare signatures and hold no executable statements.
There is nothing there to cover; the number is an artefact of the coverage
tool counting an interface file, not a gap in the tests.

**The infrastructure layer rose from 79.48% to 99.14%** in Stage 5, on the
strength of the new `row-mapping.test.ts`. All five readers are now at
**100% lines**; the one remaining uncovered line is the `physical()` map's
defensive throw, which fires only on an unmapped column — a defect guard,
not a reachable path.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| `reportSelectColumns` gated the FR-38 summary columns behind `grantsReportContent`, so the `anonymous` column selected **no summary fields** — while the domain's `reportFieldsFor` granted `summary` unconditionally. The two disagreed: a silent privacy defect in which the anonymous listing would have returned no summary. | **High** | **Fixed** — the summary columns are now unconditional |
| The Claim, Recovery Response, Thread, and Audit Trail readers used Prisma's camelCase field names directly in raw SQL. A raw `SELECT` does not go through Prisma's mapping layer, so the physical names had to be stated. | **High** | **Fixed** — extracted `physical-columns.ts` as one artefact for five readers |
| The `AuditEvent` and `Account` tables carry no `@@map`, so their physical names are `"AuditEvent"` and `"Account"` — not the snake_case plural the standards name. The raw SQL the visibility readers issue would not reach the tables the standards name. | **High** | **Open — bolt `007`'s obligation.** Recorded in the construction log |
| The `never-loaded` suite's `accounts`-join assertion was wrong: it asserted the join is absent for `unrelatedMember`, but that column **does** grant `reporterName`. | Low | **Fixed** — the assertion now uses `anonymous` for the no-join case |
| The thread id was asserted against the SQL **text**, but Prisma parameterises values (`IN ($1)`). | Low | **Fixed** — scope is now asserted on the **bindings**; the SQL text proves shape, the bindings prove scope |
| `TrailEvent` is `unknown` at the port boundary, so the row-mapping test could not read a mapped field without narrowing. | Low | **Fixed** — the test narrows to the reader's own event shape, which is where the shape belongs |

**No High or Critical issue is open inside this bolt.** The one open High
item is a schema obligation that belongs to bolt `007` by the confirmed
split, and it is recorded there.

## Verification Commands

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | ✅ clean |
| `npx eslint src/{domain,application,infrastructure}/listings` | ✅ clean |
| `npx vitest run` | ✅ **1005 tests, 61 files** — the existing suite stayed green |
| `npx vitest run --coverage` | ✅ **94.19% lines** overall (floor: 80%) |
| `npm run build` | ✅ Next.js 16.4.3 production build succeeds |

## Ready for Operations

- [x] All acceptance criteria met — 22 of 22
- [x] Code coverage > 80% — 94.19% overall; 95.07% / 90% / 99.14% by layer
- [x] No critical/high severity issues open within this bolt — one High obligation recorded for bolt `007` (`@@map` annotations)
- [ ] Performance targets met — **out of scope**: the bolt adds no route and no UI
- [x] Security tests passing — 42 assertions
