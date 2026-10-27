---
unit: 006-audit-and-observability
bolt: 003-audit-lost-side-events
stage: test
status: complete
updated: 2026-10-27T09:00:00Z
---

# Test Report - Lost-side Audit Events

Bolt `003-audit-lost-side-events` of unit `006-audit-and-observability`,
intent `001-findback-lost-and-found`.

Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit | 60 | 0 | 0 | 98.84% (`src/domain/audit`), 95.13% (`src/application`) |
| Integration | 29 | 0 | 0 | 96.20% (`src/infrastructure/audit`), 95.65% (`src/infrastructure/db`) |
| Security | 18 | 0 | 0 | — (subset of the above) |
| Performance | 6 | 0 | 0 | — (subset of the above) |
| Acceptance | 11 | 0 | 0 | — (subset of the integration category) |
| Parity | 7 | 0 | 0 | — (subset of the unit category) |
| **Total** | **353** | **0** | **0** | **95.02%** (all files), 92.76% branches, 100% functions |
- **Test files:** 31 (27 pre-existing, 4 added in this stage)
- **Coverage threshold:** 80% lines (`vitest.config.mts`) — met at 95.02%
- **Database:** local Docker PostgreSQL 16 (`findback-postgres`, port 5433)

The categories overlap: the security, performance, and acceptance suites are
counted in both their own category and the integration category, because they
exercise the real database. The total is the count of distinct test cases.

**This stage found two real defects in the Stage 4 implementation.** Both are
fixed and described under *Issues Found*. Neither was caught by the unit tests
written in Stage 4 — they were caught by writing the acceptance criteria as
executable statements.

Test Files Added in This Stage

| File | Tests | Category | What it covers |
|---|---|---|---|
| `src/infrastructure/audit/lost-side-acceptance.test.ts` | 11 | Acceptance | One test per acceptance criterion of story `002`, plus the two edge cases |
| `src/infrastructure/audit/lost-side-security.test.ts` | 18 | Security | Determination forgery, role confusion, sensitive-value leakage, injection, append-only integrity |
| `src/infrastructure/audit/lost-side-performance.test.ts` | 6 | Performance | The two FR-48 NFRs, and the query plan behind them |
| `src/domain/audit/prd-parity.test.ts` | 7 | Parity | The catalog against the frozen PRD — bolt `001`'s open recommendation |

Test Files Changed in This Stage

| File | Change |
|---|---|
| `src/application/lost-side-event-factory.test.ts` | The event 16 parent assertion, corrected to `msg-1` |
| `src/application/audit-writer.ts` | The `reason` column is now checked for a credential |
| `src/application/lost-side-event-factory.ts` | Event 16's `parent_id` is the thread message |

Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 002 | Any Recovery Response transition records the corresponding FR-48 event from 15 to 30 | ✅ |
| 002 | Events 18 or 19 store `determined_by` and `recorded_by` as two distinct values | ✅ |
| 002 | The Lost Returned closeout records events 21 or 22, 26, and 30 in the same transaction | ✅ |
| 002 | The trail covers response submission, provisional selection, determination, closeout or closure, and the reason for each terminal resolution | ✅ |
| 002 | A Unit 004 event and a Unit 005 event appear under the same parent report with no gap between them | ✅ |
| 002 | An audit reason is stored verbatim even where the user-facing copy was softened | ✅ |
| 002 | *(edge case)* Standby responders generate no events of their own | ✅ |
| 002 | *(edge case)* A closeout that rolls back partway leaves no closeout events | ✅ |

Bolt success criteria, all satisfied:

| Criterion | Status |
|-----------|--------|
| Every FR-48 event from 15 to 30 is defined with actor and timestamp | ✅ |
| Events 18 and 19 store `determined_by` and `recorded_by` as distinct values | ✅ |
| Events 21 or 22, 26, and 30 fire from Unit 005's closeout in the same transaction | ✅ |
| The trail shows no gap between events emitted by Unit 004 and Unit 005 | ✅ |
| Audit reasons are verbatim even where user-facing copy was softened | ✅ |
| No event records an observed identifying detail, exact place, or thread body | ✅ |

The criterion-by-criterion tests live in
`src/infrastructure/audit/lost-side-acceptance.test.ts`; each test name states
the criterion it discharges.

Unit Tests

`src/domain/audit/lost-side-events.test.ts` (18 tests) carries the domain
layer's four guards: `assertDeterminationPair` refuses a determination whose
maker is not the report's owner; `resolveSystemActor` refuses a system event
that names no human; `assertBatchShape` refuses a malformed child-response
set; `assertReturnedPairing` refuses a Returned closeout whose matched
response is not in the batch. Each error type is asserted by name, so a
caller can distinguish "this determination was forged" from "this batch was
malformed".

`src/application/lost-side-event-factory.test.ts` (28 tests) covers all
thirteen factory methods — every FR-48 event, the two determination outcomes
mapping to events 18 and 19, the two receiver variants mapping to events 21
and 22, and `recordReturnedCloseout` writing events 26 and 30 together or
neither.

`src/domain/audit/prd-parity.test.ts` (7 tests) is new in this stage and is
described under *Parity Tests* below.

Integration Tests

`src/infrastructure/audit/lost-side-events.test.ts` (11 tests, live database)
exercises the real stack — the Prisma adapter, the pooled connection, the
append-only triggers, and the transactions. Notable cases:

- A write inside a transaction is visible after commit, and **absent** after
  the transaction rolls back.
- A write with a handle that is not a transaction is refused with
  `AuditWriteOutsideTransactionError`.
- The `event_number` CHECK constraint refuses a number outside 1–30, and
  refuses a NULL-free number the catalog does not name.
- The `actor_role` CHECK constraint refuses a role outside the closed set.

`src/infrastructure/audit/lost-side-acceptance.test.ts` (11 tests, live
database) is the criterion-by-criterion suite, described above.

Security Tests

`src/infrastructure/audit/lost-side-security.test.ts` covers five controls.

**Determination forgery (FR-43, ADR-11).** A determination attributed to a
member who is not the report's owner is refused, and the refusal rolls the
transaction back — the trail is left empty, not half-written. A determination
with no maker and no recorder is refused the same way. The same person in
both capacities is *accepted* when the report's owner is an administrator,
because `administrator` is a flag on an Account, not a disjoint role, and
refusing that would push operators toward fabricating a second identity.

**Role confusion (FR-45).** The acting administrator and the
determination-maker are recorded in two separate columns, and the test
asserts both values independently — the maker in `determined_by_user_id`, the
recorder in `recorded_by_administrator_id`, the writing administrator in
`acting_administrator_id` and `actor_id`. A single actor field would destroy
the distinction, which is the whole point of the pair.

**Sensitive-value leakage (FR-37, FR-39).** The where-found and the observed
identifying details are catalog-named for event 15, so they are recorded on
the administrator-only trail — and refused on every event the PRD does not
name them for. A thread body is refused on any event but 16. The `reason`
column is checked for a credential: a bcrypt hash and a `sk_live_` token are
both refused, and the ordinary administrator reason is stored exactly as
given, so the verbatim rule is not weakened by the check.

**Injection and storage safety.** A hostile where-found and a hostile reason
are both stored **verbatim as data**, and the table they name is still there
afterwards. A batch set naming a response with an empty id is refused at the
shape check, not stored.

**Append-only integrity (story `004`).** An update to a Lost-side event is
refused, a delete is refused, and a determination whose maker is rewritten
after the fact is refused. The refusal comes from the database trigger, so
there is no privilege that could succeed.

Performance Tests

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Lost-side trail query p95 | ≤ 1000 ms | **0.7 ms** | ✅ |
| Lost-side trail query p50 | — | 0.5 ms | — |
| Lost-side trail query max | — | 1.0 ms | — |
| Verification-screen trail, 50 Recovery Responses, p95 | ≤ 1000 ms | **1.2 ms** | ✅ |
| Verification-screen trail, 50 Recovery Responses, p50 | — | 1.1 ms | — |
| Verification-screen trail, 50 Recovery Responses, max | — | 2.4 ms | — |
| Scale | 10,000 reports × 50 events | 500,000 rows seeded | ✅ |
| Query plan | index scan, no sort | Index Only Scan on `idx_audit_events_trail` | ✅ |
| Page size | 25 per page | 25 | ✅ |

Two NFRs are under test, both from FR-48:

- *"Audit trail queries must complete within 1 second at p95 against 10,000
  reports with 50 events each"* — measured against the **Lost-side** parent
  filter (`parent_type = 'report'`), because the Lost side is the shape this
  bolt owns. Bolt `001` measured the same scale against the `claim` parent.
- *"Verification screen renders within 1 second at p95 against a Lost report
  with up to 50 Recovery Responses"* — the screen itself is Unit 007's, but
  its input is the report's trail. The test reads **every page** of a
  50-response report's trail, not one page, because that is what the screen
  consumes.

The seed is a bulk insert (the read path is under test, not the write path),
and the table is `ANALYZE`d afterwards so the planner costs the plan on
current statistics rather than a stale estimate. The plan assertion — index
scan, no `Sort` node — is the one that has teeth: the timing assertion alone
would pass even with a plan that sorts, because the budget is 1,000 ms and
the measured time is under 2 ms either way.

**No new index was needed.** `idx_audit_events_trail` on
`(parent_type, parent_id, occurred_at DESC, id DESC)`, added by bolt `001`,
serves the Lost-side parent filter and the ordering unchanged. Every column
of the index is constrained by the query, so the plan is an index-only scan.

Parity Tests

`src/domain/audit/prd-parity.test.ts` closes the gap bolt `001`'s test
report recommended: the catalog exists in two places — the frozen PRD and
`src/domain/audit/event-catalog.ts` — and the shape tests did not catch a
drift between them.

The test reads the PRD itself, parses the numbered lines of the FR-31 and
FR-48 sections, and asserts:

- all thirty numbered events parse, in order;
- every PRD event has a catalog entry with that number;
- every event's **title** matches the PRD's title, ignoring only a trailing
  scope qualifier the catalog carries in its type discriminator instead;
- every field the PRD names for an event is carried, in the payload or in a
  typed column;
- every typed column the check relies on is a real column on `AuditEvent`;
- the catalog adds no numbered event the PRD does not name, and the two
  non-numbered records are exactly FR-52 and FR-53.

**The check is not vacuous.** It was verified by injecting four drifts into
the catalog — renaming event 15, dropping a field from it, moving event 30 to
number 31, and dropping the numbered set's completeness — and the suite
caught all four. The catalog was restored and the suite returns to green.

Coverage Report

| Module | Statements | Branches | Functions |
|--------|-----------|----------|-----------|
| `src/domain/audit` | 98.84% | 96.77% | 100% |
| `src/application` | 95.13% | 91.04% | 100% |
| `src/application/ports` | 100% | 100% | 100% |
| `src/infrastructure/audit` | 96.20% | 92.85% | 100% |
| `src/infrastructure/db` | 95.65% | 77.27% | 100% |
| `src/lib` | 100% | 50% | 100% |
| **All files** | **95.02%** | **92.76%** | **100%** |

Coverage rose from 94.40% to 95.02%. The remaining gaps are barrel
`index.ts` files (re-exports, no logic), `lost-side-event-factory.ts` lines
540/548/556 (three validation branches), `payload-sanitizer.ts` line 165 (one
branch of the secret heuristic), `quota-monitor.ts` line 94 (the error path
for an unavailable usage reader), `trail-query.ts` line 158, `prisma.ts` line
25 (the cached-connection path on a warm process), and the `ui/tokens.ts`
file, which is untested because no UI consumes the audit trail yet.

Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Event 16's `parent_id` was the Recovery Response id, not the thread message id. The Stage 2 design specifies `parent_id = message`, and the trail's retention follows the parent entity's own lifetime — so the event was filed against the wrong parent, and the report's own trail could not show the message post. | High | **Fixed** — `ThreadMessagePostedDraft` now carries `threadMessageId`; the parent is the message, and the response id stays in the payload so the event is still queryable by response. The trail's retention rule is unaffected: a thread message is retained for the report's lifetime either way. |
| The `reason` column bypassed the payload sanitizer, so a password, hash, or token pasted into an administrator's reason was written to the trail. The standards say a credential is never written to the trail *or* the log, and the trail's Sensitive-Field exception covers catalog-named *fields*, not credentials. | High | **Fixed** — `AuditWriter.record` now applies the sanitizer's `looksLikeSecret` heuristic to the reason and refuses it. The check errs towards refusing, and the ordinary reason is still stored verbatim. |
| The Stage 4 unit tests asserted the shape of each event but not the **relationship** between the report's trail and the events on it, so neither defect above was caught by them. | Medium | **Fixed** — the acceptance suite asserts the whole trail as one set, and the parity suite asserts the catalog against the PRD. |
| The catalogue's `additionalFields` do not carry the `determined_by` / `recorded_by` pair, the reason, or the receiver, because those live in typed columns. A reader of the catalog alone cannot tell where a PRD-named field is stored. | Low | **Fixed** — the parity test now states the distinction explicitly and asserts a typed column is a real column on the model. The catalog itself is unchanged: `additionalFields` remains the payload-only list. |

No critical or high-severity issue is open.

Manual Verification

The app was started with `npm run dev` and confirmed to render at
`http://localhost:3000` — the homepage shows "FindBack — Lost and found for
the campus community — Environment ready". The dev server is left running
for the owner.

The Lost-side audit behaviour was then exercised **against the live
database** by `scripts/lost-side-smoke.ts` (`npm run smoke:lost-side`), which
is the closest thing to clicking through the behaviour that is possible
today. It drives the same factory the firing modules will call, then reads
the trail back through the same `AuditTrailReader` the administrator's trail
view will use. All eight checks passed:

```
1. Report trail: 7 entries, newest first
   #30 recovery_response.completed_report_returned
   #26 report.lost_returned_child_response_resolution
   #21 returned.confirmed_lost_default_receiver
   #18 recovery_response.determined_match_confirmed
   #29 report.lost_transition_to_verification_pending
   #17 recovery_response.selected_for_verification
   #15 recovery_response.submitted
2. No-gap trace [15, 17, 18, 21, 26, 29, 30] — OK
3. Determination #18 — determined_by …0f2, recorded_by …0f3
4. Event #16 parent — recovery_response_thread_message / …0f7 (the message id)
5. Forged determination refused — OK
6. Credential in the reason refused — OK
7. Non-administrator refused — OK
8. Update of a trail entry refused — OK
```

The trail is read back newest-first and the no-gap trace is exactly the PRD's
seven events. The two defects this stage found are visible in that output:
check 4 shows event 16 filed under the **message**, and check 6 shows the
credential refused.

Not Tested Manually

Stated plainly, because the Stage 5 contract requires it:

- **The end-to-end Lost-side UI** — Units 004, 005, and 007 are not built, so
  no Recovery Response can be submitted, selected, or determined through a
  screen. The trail is exercised directly against the real database, through
  the same factory and the same reader the firing modules and the trail view
  will use. The homepage was opened and confirmed to render; it does not
  exercise the audit trail.
- **The Vercel Blob path** — no blob is written by this bolt. The Blob
  storage provider was exercised against an injected client in bolt `001`,
  not against the live Vercel API.
- **Email** — no email path is exercised by this bolt.
- **The deployed Vercel environment** — the performance numbers are from
  local Docker PostgreSQL, not from a Hobby-tier deployment. A free-tier
  instance has less I/O headroom, so the p95 margin there will be smaller
  than the 0.7 ms measured here. The 1,000 ms budget is wide enough that
  the conclusion is not in doubt, but the number is not a production number.

Recommendations

1. **Re-measure on a Vercel Hobby deployment** before the Lost-side trail
   view ships, so the p95 figure in this report is a production figure. The
   query is an index-only scan, which is the shape that survives a shared,
   slower disk.
2. **Units 004 and 005 must call the factory, not write events directly.**
   The factory is the only thing that holds the determination-owner check
   (ADR-11) and the batch-shape check. An event written by any other path
   would bypass both. This should be stated in those units' briefs when they
   are built.
3. **Event 16's parent is the thread message, so a report's own trail does
   not show the message posts.** This is correct — the retention rule follows
   the parent entity — but a reader of the Lost report's trail will not see
   the messages. The trail view for a report should therefore offer a link
   to each response's thread trail, or the reader will conclude the thread
   was never posted to. This is a UI question for Unit 007, and it is worth
   deciding before the trail view is built.
4. **The `reason` credential check is a heuristic.** It catches bcrypt
   hashes, long hex blobs, JWTs, and prefixed secrets. It will not catch a
   password written in plain language. The check is a backstop, not the
   control; the control is that no reason is ever rendered outside the
   administrator-only trail.
5. **The parity test depends on the PRD's formatting.** The PRD's event lists
   are parsed with a regular expression over `N. **Title** — fields`. If the
   PRD's format changes, the test fails loudly — the "parses all thirty"
   test is the canary — rather than silently checking nothing. That is the
   intended behaviour, but it means a PRD reformat is a test change.

Ready for Operations

- [x] All acceptance criteria met
- [x] Code coverage > 80% — 95.02%
- [x] No critical/high severity issues open — both High issues are fixed
- [x] Performance targets met — p95 0.7 ms and 1.2 ms against a 1,000 ms budget
- [x] Security tests passing — 18/18
- [ ] Manual verification of the Vercel Blob and platform quota paths
      (not possible locally — see *Not Tested Manually*)
- [ ] End-to-end verification against the real Lost-side screens, once
      Units 004, 005, and 007 exist
