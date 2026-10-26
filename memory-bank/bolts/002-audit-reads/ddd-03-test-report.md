---
unit: 006-audit-and-observability
bolt: 002-audit-reads
stage: test
status: complete
updated: 2026-10-26T13:15:34Z
---

# Test Report - Audit and Observability (read side)

Bolt `002-audit-reads`, story `005-audit-visibility-and-read-logging`.

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit | 47 | 0 | 0 | 98.5% (domain), 95.4% (application) |
| Integration | 46 | 0 | 0 | 95.7% (infrastructure) |
| Security | 31 | 0 | 0 | - |
| Performance | 8 | 0 | 0 | - |
| **Total** | **254** | **0** | **0** | **94.51% lines** |

24 test files, all passing. Line coverage **94.51%** against the 80% floor in
`vitest.config.mts`; branch coverage 92.52%; function coverage 100%.

The category counts overlap by design — a single test may be both an
acceptance test and a security test. The per-file breakdown is at the end of
this report, and it is the authoritative tally.

## Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 005 | A non-administrator attempting to reach any audit view is refused, and no trail content is returned | ✅ |
| 005 | An administrator opening a report's audit trail gets it in reverse-chronological order | ✅ |
| 005 | A read is recorded capturing administrator, query, filters, result count, and timestamp | ✅ |
| 005 | The read record is a distinct record type and not an event on the audited entity | ✅ |
| 005 | Audit-trail storage is in the database rather than only in runtime logs | ✅ |
| 005 | The query completes within 1 second at p95 against 10,000 reports with 50 events each | ✅ |
| 005 | A trail listing shows 25 entries per page with no infinite scroll | ✅ |

**Criterion 1** — `acceptance-read-criteria.test.ts`: "refuses a
non-administrator and returns no trail content" (the refusal and the empty
read log) and "refuses a non-administrator without reaching the database"
(a repository that throws if called, proving the check is a pre-query gate
and not a query filter).

**Criterion 2** — "returns the trail in reverse-chronological order", which
asserts the timestamps are sorted descending and that the first and last
events are the expected ones.

**Criterion 3** — "records the administrator, query, filters, result count,
and timestamp", asserting each field of the stored row.

**Criterion 4** — "records the read as a distinct record type, not as an
event on the audited entity". Two assertions: the trail's row count is
unchanged by the read, and the read record has none of a trail event's
fields (`eventType`, `eventNumber`, `parentId`).

**Criterion 5** — "stores the read in the database, not only in runtime
logs", plus "refuses to update or delete a read record", which asserts the
append-only trigger fires on a direct `DELETE`.

**Criterion 6** — measured in `audit-performance.test.ts`; see the
Performance section for the numbers.

**Criterion 7** — "shows 25 entries per page and no more" (a caller asking
for 1000 is capped, not refused), "offers no further page when exactly 25
events exist" (`nextCursor` is null), "paginates by cursor rather than by
offset" (the page is bounded), and "walks the whole trail one page at a
time, without repeating an event" (30 events across two pages, no repeats).

## Unit Tests

| File | Tests | What it covers |
|---|---|---|
| `src/domain/audit/trail-query.test.ts` | 18 | The closed filter set; `clampTrailLimit` capping a larger request, keeping a smaller one, defaulting on a missing or non-finite value, and never returning less than one; the cursor's opaque base64url encoding, its round trip, and its refusal of a missing, malformed, or empty-id token; `isTrailParentType`; `describeTrailFilters`; `describeTrailQuery` |
| `src/application/classify-write-failure.test.ts` | 10 | The closed transient/permanent classification: a Prisma `P2034` write conflict is retryable; socket-level errors are retryable; the transient adapter kinds are retryable; PostgreSQL `40001` and `40P01` are retryable; the append-only trigger's `23001` is permanent; a unique, not-null, and foreign-key violation are permanent; an unrecognised error is permanent, so a defect is not retried |
| `src/application/audit-trail-service.test.ts` | 16 | The use case: the read and its record; the refusal before the query; the refusal of the whole trail; the refusal of an unknown parent type; a read of an empty trail; the 25-entry cap; the filters passed through and recorded; **no record when the query fails**; the retry of a transient failure; the three-attempt bound; **the trail returned even when the record cannot be written**; the failure logged with `outcome: "error"`; a permanent failure not retried; the same id on every attempt; **a fresh transaction per attempt**; exactly one transaction on success |
| `src/application/audit-trail-reader.test.ts` | 5 | The reader's own pre-query check (from bolt 001) |
| `src/application/audit-read-recorder.test.ts` | 3 | The recorder's fields, its null defaults, and its refusal outside a transaction |

**The three tests that matter most** are in `audit-trail-service.test.ts`:
*"does not record a read when the query fails"* (the ordering guarantee),
*"returns the trail even when the read record cannot be written"* (the
failure rule), and *"opens a fresh transaction for each attempt"* (the
property that makes the retry possible at all).

## Integration Tests

| File | Tests | What it covers |
|---|---|---|
| `src/infrastructure/audit/audit-read-path.test.ts` | 16 | The filtered query against a real database: the action-type filter, the actor filter, the date range, all three applied together, no filter returning everything, a filter matching nothing, a hostile filter value stored as data, the filters not escaping the parent scope, and cursor pagination of a filtered result. Plus the read record: written after the read, carrying no trail data, written for an empty trail, written once per read with no deduplication, and not written for a refused read. Plus the idempotent retry: the same id written twice produces one row |
| `src/infrastructure/audit/acceptance-read-criteria.test.ts` | 12 | Story 005's seven criteria, one test each (see above) |
| `src/infrastructure/audit/audit-repositories.test.ts` | 18 | The repositories, from bolt 001 |
| `src/infrastructure/audit/acceptance-criteria.test.ts` | 14 | Stories 001, 003, 004, 006, from bolt 001 |
| `src/infrastructure/audit/append-only-enforcement.test.ts` | 10 | The append-only guarantee, from bolt 001 |

## Security Tests

Bolt 001 covered the **write** path's security. This bolt adds the **read**
path's, in `src/infrastructure/audit/audit-read-security.test.ts` (12 tests).

| Concern | Test | Result |
|---|---|---|
| Filter injection | A hostile event-type filter is stored as data — the table it named is still there with its row intact | ✅ |
| Filter injection | A hostile actor filter is refused as a value, and the row survives | ✅ |
| Filter injection | A hostile date filter is refused as a value, and the row survives | ✅ |
| Cursor tampering | A cursor whose id is not a uuid is refused rather than interpolated | ✅ |
| Cursor tampering | A forged cursor token is decoded to exactly two fields, both of which are bound as parameters | ✅ |
| Cursor tampering | A malformed cursor token is treated as no cursor | ✅ |
| Cursor tampering | A cursor does not escape the parent scope — the other parent's event is never returned | ✅ |
| Cursor tampering | A legitimate cursor round-trips and continues the page with no repeat | ✅ |
| Data leakage | No sensitive value reaches the read record — a catalog-named sensitive value on the trail is absent from the read log | ✅ |
| Data leakage | A hostile filter value is recorded verbatim, which is what makes the record evidence of what was asked for | ✅ |
| Integrity | Reading the trail does not add to the trail | ✅ |
| Integrity | A read record cannot be edited after the fact — the trigger refuses a direct `UPDATE` | ✅ |

`src/infrastructure/audit/audit-security.test.ts` (19 tests) covers the write
path's injection safety from bolt 001 and still passes.

**The authorization guarantee, tested at three levels.** The unit test proves
the repository is never reached for a refused viewer. The integration test
proves no read log row is written for a refused read. The smoke test proves
the same end to end against the real stack.

## Performance Tests

`src/infrastructure/audit/audit-performance.test.ts`, seeded at the PRD's
scale: **10,000 reports × 50 events = 500,000 rows**.

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Trail query p95 (unfiltered) | ≤ 1,000 ms | **0.8 ms** | ✅ |
| Trail query p50 (unfiltered) | — | 0.6 ms | — |
| Filtered trail query p95 | ≤ 1,000 ms | **0.8 ms** | ✅ |
| Filtered trail query p50 | — | 0.5 ms | — |
| Whole-trail read p95 | ≤ 1,000 ms | **7.7 ms** | ✅ |
| Whole-trail read p50 | — | 6.6 ms | — |
| Whole-trail read max | — | 21.0 ms | ✅ |
| Trail query plan | index scan, no sort | Index Only Scan on `idx_audit_events_trail` | ✅ |
| Filtered query plan | index scan, no sort | index scan, no `Seq Scan`, no `Sort` | ✅ |
| Whole-trail read plan | index scan, no sort | `idx_audit_events_occurred`, no `Seq Scan` | ✅ |

**The two measurements Stage 2 committed to, now measured rather than
assumed.** The design decided "no new index in this bolt" on the grounds that
a single report's trail is 50 rows and filtering 50 rows is not a
performance problem. That decision was explicitly a decision *to be
measured*. It holds:

- The **filtered** query is p95 0.8 ms — the same as the unfiltered one,
  because the filter narrows a 50-row set and the plan is still an index
  scan over `idx_audit_events_trail`. **No new index is needed.**
- The **whole-trail** read is p95 7.7 ms — an order of magnitude slower than
  the contextual read, because it scans 500,000 rows' worth of index rather
  than 50. It uses `idx_audit_events_occurred`, exactly as Decision 9
  predicted, and stays 130× inside the budget.

**The whole-trail read is 10× slower than the contextual read, and that is
expected.** It is a backend capability with no route (ADR-8), and a whole-trail
read is a different question from a per-report read. 7.7 ms at p95 is not a
concern at any plausible rate, and it is measured rather than guessed.

## Coverage Report

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 94.58 | 92.52 | 100 | 94.51 |
| `application/` | 95.38 | 91.34 | 100 | 95.34 |
| `application/ports/` | 100 | 100 | 100 | 100 |
| `domain/audit/` | 98.50 | 96.24 | 100 | 98.48 |
| `infrastructure/db/` | 95.65 | 77.27 | 100 | 95.65 |
| `lib/` | 100 | 50 | 100 | 100 |

The floor is 80% lines (`vitest.config.mts`). Every layer is above it.

The lowest branch coverage is `lib/` at 50% — the `ValidationError` class
added in Stage 4 is constructed but its message override branch is not
exercised. That is a gap, not a defect: the error is raised and asserted in
`audit-trail-service.test.ts`, and only the optional custom-message path is
untested.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| The retry originally reused one transaction handle. A failed statement aborts its PostgreSQL transaction, so a retry inside the aborted one could never succeed. | **High** | **Fixed in Stage 4** — the loop moved into `AuditTrailService`, which opens a fresh transaction per attempt. Asserted by "opens a fresh transaction for each attempt" |
| The Stage 2 design said the read record "does not carry event types, actor names, or reasons", contradicting the frozen story's requirement to capture "the filters applied" — and the action-type filter *is* a list of event type names. | **Medium** | **Fixed in Stage 4** — the corrected wording ("no trail data"; filters are *criteria*, not the data they selected) is in the domain model, the technical design, and ADR-8. The test asserts the criteria are present and an event's reason is absent |
| The smoke script counted read records by a fixed request id. The read log is append-only and permits no deletion, so records accumulated across runs and the count grew every time — the script would have failed on every run after the first. | **Medium** | **Fixed in Stage 5** — the request id is now unique per run, and the script was run twice to confirm it is repeatable |
| `PrismaTransactionFactory` and the two audit repositories defaulted to the shared `prisma` singleton, which is constructed at module load — before the smoke script's own environment loader ran. | **Low** | **Fixed in Stage 4** — the client is now a required constructor parameter |
| The read log's `resultCount` is the *filtered* count, not the trail's total size, so an investigator cannot size a trail from the read record. | **Low** | **Open — by design.** The story requires the record to capture "the filters applied" and "result count"; the count that describes what was shown is the filtered one. Recorded here so it is not mistaken for an oversight |

**No critical or high-severity issues remain open.** The one high-severity
issue was found in Stage 4 and fixed there.

## Errors Found and Fixed During This Stage

Three test failures, all in the **new** tests, and all errors in the tests
rather than in the code:

1. *"encodes the cursor as an opaque token"* seeded one event, so there was
   no next page and `nextCursor` was null. The test needed a trail of more
   than 25 events.
2. *"does not let a forged cursor widen the result set"* asserted that a
   future-dated cursor returns nothing. The cursor means *older than*, so a
   future-dated cursor correctly returns everything older — which is our
   event. The test was rewritten to assert the property that actually
   matters: that a cursor taken from another parent's trail cannot widen the
   result past the parent filter.
3. *"round-trips a legitimate cursor"* had the same one-event problem as (1).

No production code was changed to make a test pass. The only production
change in this stage was the smoke script's request id, which is a
**test harness**, not product code — and it was a real defect that would
have failed on every run after the first.

## Ready for Operations

- [x] All acceptance criteria met
- [x] Code coverage > 80% — **94.51% lines**
- [x] No critical/high severity issues open
- [x] Performance targets met — p95 0.8 ms against a 1,000 ms budget
- [x] Security tests passing — 31 read and write path security tests

**Verification run for this stage:** typecheck pass · lint pass · Prettier
pass · **254/254 tests across 24 files** · coverage 94.51% lines / 92.52%
branches / 100% functions · build pass · `npm run smoke:audit` **11/11**,
run twice to confirm repeatability · dev server **HTTP 200** on port 3000,
still running.

**Not manually tested.** The Vercel Blob path and the outbound email path
were not touched by this bolt and cannot be exercised locally. They are
covered by automated test only, per `construction-protocol.md` CP-4. This
bolt's own read path **was** exercised end to end against the real database
through the smoke script.

## Recommendations

1. **Re-measure on a Vercel Hobby deployment before the audit trail is used
   in production.** The numbers here are from a local Docker PostgreSQL with
   a warm page cache. Bolt 001's test report made the same recommendation and
   it still stands. The margin is large (0.8 ms against 1,000 ms), so this is
   a confirmation rather than a concern.

2. **The whole-trail read is the one path that gets slower with data.** At
   500,000 rows it is p95 7.7 ms, and it grows roughly linearly. It is
   behind a capability with no route, and nothing in the PRD requires it, so
   it is not a risk today. If a surface for it is ever added, re-measure
   first.

3. **`AuditTrailService` is now the only place that knows the read's failure
   rules.** A future caller that reads the trail without going through the
   service would lose the read record. This is the same class of risk ADR-6
   addresses for the write path, and the same mitigation applies: when Unit
   007 builds the two audit page routes, they must call the service rather
   than the reader.

4. **The `ValidationError` branch in `lib/errors.ts` is untested.** Trivial,
   but it is the one gap in an otherwise complete layer.

## Per-file test counts

| File | Tests |
|---|---|
| `src/infrastructure/audit/audit-performance.test.ts` | 8 |
| `src/infrastructure/audit/acceptance-read-criteria.test.ts` | 12 |
| `src/infrastructure/audit/acceptance-criteria.test.ts` | 14 |
| `src/infrastructure/audit/audit-repositories.test.ts` | 18 |
| `src/infrastructure/audit/audit-read-path.test.ts` | 16 |
| `src/infrastructure/audit/audit-read-security.test.ts` | 12 |
| `src/infrastructure/audit/audit-security.test.ts` | 19 |
| `src/infrastructure/audit/append-only-enforcement.test.ts` | 10 |
| `src/application/audit-trail-service.test.ts` | 16 |
| `src/domain/audit/event-catalog.test.ts` | 11 |
| `src/application/audit-writer.test.ts` | 6 |
| `src/application/audit-read-recorder.test.ts` | 3 |
| `src/lib/logging.test.ts` | 3 |
| `src/domain/audit/trail-query.test.ts` | 18 |
| `src/infrastructure/audit/quota-providers.test.ts` | 11 |
| `src/domain/audit/payload-sanitizer.test.ts` | 16 |
| `src/domain/audit/quota-thresholds.test.ts` | 11 |
| `src/application/quota-monitor.test.ts` | 9 |
| `src/domain/audit/audit-event.test.ts` | 9 |
| `src/application/audit-trail-reader.test.ts` | 5 |
| `src/domain/audit/retention-policy.test.ts` | 10 |
| `src/domain/audit/request-context.test.ts` | 4 |
| `src/application/classify-write-failure.test.ts` | 10 |
| `src/lib/errors.test.ts` | 3 |
| **Total** | **254** |
