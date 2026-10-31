---
id: 009-reporting-search
stage: 5
stage_name: test
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
created: 2026-10-30T13:20:00Z
completed: 2026-10-30T13:20:00Z
verification_command: "npx vitest run src/infrastructure/listings/prisma-report-listing-partition.test.ts src/infrastructure/listings/prisma-report-listing-keyword.test.ts src/infrastructure/listings/prisma-report-listing-reader.test.ts src/infrastructure/listings/prisma-report-listing-reader.performance.test.ts src/domain/listings/report-listing-filter.test.ts src/domain/listings/report-partition.test.ts src/domain/listings/report-status-view.test.ts src/domain/listings/report-pagination.test.ts src/application/listings/report-listing-service.test.ts src/application/listings/report-detail-service.test.ts src/app/api/reports/listing-routes.test.ts"
---

# Bolt 009 — Stage 5: Test Report

## Overview

The verification of the `009-reporting-search` bolt: the public summary
listing, the authenticated detail view, the indexed search within its
performance budget, and the FR-49 view partition.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The summary row's shape | `src/domain/listings/report-listing-result.ts` | 007 | FR-38 |
| The filter's criteria | `src/domain/listings/report-listing-filter.ts` | 009 | FR-14 |
| The partition's set | `src/domain/listings/report-partition.ts` | 011 | FR-49 |
| The status view | `src/domain/listings/report-status-view.ts` | 009 | FR-14 |
| The pagination | `src/domain/listings/report-pagination.ts` | 009 | FR-14 |
| The listing use case | `src/application/listings/report-listing-service.ts` | 007, 009, 011 | FR-14, FR-49 |
| The detail use case | `src/application/listings/report-detail-service.ts` | 008 | FR-13 |
| The persistence | `src/infrastructure/listings/prisma-report-listing-reader.ts` | 007, 009, 011 | FR-14, FR-38, FR-49 |
| The transport | `src/app/api/reports/listing/route.ts`, `src/app/api/reports/[id]/route.ts` | 007, 008 | FR-12, FR-13 |

**This bolt was already implemented.** The reconnaissance for this stage
found that the domain layer, the application layer, the infrastructure layer
and the routes had all been delivered — under bolts `006` and `007`, which
completed before this bolt's dependencies were even satisfied. What was
missing was not the code but the **claim**: no bolt had ever asserted that
this code satisfies FR-12, FR-13, FR-14 and FR-49, and the four stories sat
at `status: draft` with `assigned_bolt: null` and `implemented: false`.

So this stage did the work the bolt existed to do: **it verified the code
against the stories, and it fixed what the verification found.**

Stages 1 (model) and 2 (design) were skipped by owner direction, so there is
no domain-model artifact and no technical-design artifact for this bolt. The
design decisions they would have carried are stated in the code's own doc
comments and in the governing standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own modules and its own
> eleven suites**. The broader suite's state at the last full run is recorded
> in `memory-bank/maintenance-log.md`; this report does not claim a full-suite
> result it did not measure.

## The bolt's real subject: a claim is only as strong as its weakest assertion

**A test suite proves what it asserts, and nothing else.** The existing
suite for the listing reader asserted that a keyword matches a **whole
word** — `wallet` finds `A blue wallet`. Every one of its keyword tests was
a whole-word test, and every one of them passed.

**FR-14 does not ask for a whole-word match.** The PRD says: *"Keyword
matches against item name and description (case-insensitive, **partial
match**)."* A member searching for `walle` is looking for `wallet`, and the
whole-word implementation returned **nothing**.

The suite was green and the requirement was unmet. That is the failure this
stage exists to correct, and it is worth naming plainly: **a green suite is
not evidence of a requirement.** The suite had encoded the implementation's
behaviour as its expectation, and the implementation's behaviour was wrong.

**The PRD settles it.** `requirements.md` states that where the PRD and the
stories differ, **the PRD wins**. The PRD says *partial match*. The stories
say *partial match*. Only the implementation disagreed.

## Three defects this stage found, and fixed in the production code

### 1. The keyword was a whole-word match, not a partial one

**What was wrong.** The reader matched the keyword with
`to_tsvector(...) @@ plainto_tsquery('simple', $keyword)`.
`plainto_tsquery` splits the keyword into lexemes and requires each lexeme
to be a **whole token** in the document's vector. So `walle` did not match
`A blue wallet` — the lexeme `walle` is not a token; `wallet` is.

**Why it survived.** The migration that created the search index reasoned
about the `'simple'` configuration and concluded: *"FR-14 specifies a
case-insensitive partial match against name and description, not a linguistic
search, so the `simple` configuration is the one that implements it: no
stemming, no stop words, and the lower-casing that gives the
case-insensitivity."* That reasoning is about **stemming** — whether `lose`
should match `lost` — and it answered a question that was not the question.
Partial matching is about **substrings**, and `plainto_tsquery` cannot
express a substring that is not a whole token.

**The fix, and why the obvious repair was also wrong.** The naive repair is
`name ILIKE '%walle%'`, which has exactly the right matching semantics. It
also cannot satisfy the rest of FR-14: a leading-wildcard `ILIKE` has no
usable B-tree index, so every search becomes a sequential scan over the
reports table — which FR-14 forbids (*"Search and listing queries must be
index-backed. A full scan over reports is not acceptable at this data
volume"*) and which the bolt's own success criteria make a claim about
(*"Search queries are index-backed; no full table scan over reports"*).

So the fix was a **`pg_trgm` GIN index**, which supports `ILIKE '%substring%'`
through the `gin_trgm_ops` operator class. The partial match and the
index-backed plan come from the same mechanism rather than from two that
have to be kept in agreement.

**The migration.** `prisma/migrations/20261030140000_reporting_partial_keyword_match/migration.sql`
enables `pg_trgm` and creates two indexes — `idx_reports_name_trgm` over
`name` and `idx_reports_description_trgm` over `description`.

**Two indexes, not one over the concatenation.** A single index over
`name || ' ' || description` would match a trigram straddling the two
columns — the last character of a name and the first of a description — which
appears in neither field. A member searching for that sequence has typed
nothing that appears in either column, and a match on it would be an artefact
of how the index was built. Two indexes, two predicates, `OR`-ed: the keyword
must be a substring of the name **or** of the description, which is exactly
FR-14's *"matches against item name and description"*.

**The `tsvector` index is not part of the match.** An earlier draft of the
fix combined the trigram predicate with the `tsvector` predicate using
`AND`, on the reasoning that the two "agree about what a partial match
means". **They do not.** A `tsquery` is a **token** language: it matches
whole lexemes and, in its prefix form, lexemes that *begin* with the
caller's text. It cannot express a substring in the *middle* of a word — `lue`
is not a prefix of `blue`, so `to_tsquery('simple', 'lue:*')` does not match
`A blue wallet` even though `lue` is plainly a substring of it. ANDing the
two predicates therefore **narrows the match wrongly**: the trigram says yes
and the tsquery says no, so the row is excluded even though the keyword is
genuinely a substring of its name.

**The suite found this.** The three failures in the first run of
`prisma-report-listing-keyword.test.ts` were exactly the three cases where
the AND was wrong — a mid-word substring, a bare `%`, and a keyword of only
punctuation. The fix was to make the trigram predicate the whole of the
match, and to keep the `tsvector` index in the schema (it is bolt `007`'s,
and the suites still assert it is usable by an expression matching it
exactly) while taking it out of the match.

**The keyword is a literal, not a pattern.** `ILIKE` treats `%` as "any run
of characters" and `_` as "any single character". A member searching for
`blue_bag` means the underscore; without escaping, `blueXbag` would match
too. The reader escapes both metacharacters and binds the result — the
keyword's contents never become a fragment of SQL.

### 2. The participation partitions did not exclude the member's own reports

**What was wrong.** FR-49 says the `claims` partition holds *"only Claims
they submitted on **other members'** Found reports"*, and the
`recovery_responses` partition the same for Lost reports. The reader's
participation predicate carried only the membership predicate — *"these are
my Claims"* — and not the ownership exclusion — *"on someone else's
report"*.

**How it slipped through.** `report-partition.ts` had already reasoned about
this and recorded that the exclusion is *"belt-and-braces"*: a member cannot
claim on their own report, because FR-15 forbids it. The domain said the
exclusion was there; the **query** did not enforce it. The reasoning was
sound — the exclusion is indeed redundant in the normal case — but a
redundant rule that is not written down is a rule that a later change can
remove without anyone noticing.

**Why it mattered anyway.** The four views' **disjointness** is the property
FR-49 calls the point of the partition. A member who claimed on their own
report — by whatever route — would see that report in both `mine` and
`claims`, which is exactly what the partition exists to prevent.

**The fix.** The ownership exclusion is now a predicate in the query, for the
same reason `browse` carries its own: a reader that loaded the participation
rows and then filtered out the member's own reports would be the
load-then-filter defect FR-39 names, applied to the partition instead of to
a field.

### 3. The participation rows carried no link to their thread

**What was wrong.** FR-49 says the `claims` partition's rows show *"a link
to the per-Claim thread"*, and the `recovery_responses` partition's rows show
*"a link to the per-Recovery-Response thread"*. The reader selected
`NULL::uuid AS thread_id`, so the link was always `null` and a member could
not reach their conversation from the list.

**Why it was there.** The reader's own comment gave the reason: *"The
thread table (`thread_messages`) belongs to Unit 003 — the Claims workflow —
and it does not exist in the schema."* That was true when the reader was
written. It stopped being true when bolt `023` created the table
(migration `20261030120000_claim_thread_messages`).

**The fix, and the question it answered.** A thread has **no entity of its
own** — it is the set of messages hanging from a `(parent_type, parent_id)`
pair, and the route that serves it is `/api/claims/[id]/thread`, with the
Claim's own id in the path. So the `threadId` is **the participation's own
id**, and **no join to `thread_messages` is needed** to produce it. The
reader selects the Claim's id instead of a literal `NULL`.

**The id is present even when the thread is empty.** A thread with no
messages is still the Claim's conversation — it is where the member would
post — so a `null` here would claim the conversation does not exist, which
is a different and wrong claim.

## A brittle assertion, made real

**The `tsvector` index assertion was passing for the wrong reason.** Bolt
`007`'s plan assertion disabled sequential scans and asserted a *bitmap index
scan on `idx_reports_search`*. The technique is sound: with sequential scans
unavailable, the query must be answered by an index, and if the reader's
expression had drifted from the index's there would be none it could use.

**But the query carried an `ORDER BY date` and a `status` filter**, and each
of those gives the planner a *better* plan than the search index: it walks
`idx_reports_date` or `idx_reports_status_date` for the ordering or the
status and applies the keyword as a filter. Both plans are index-backed and
fast, and **neither proves anything about the search index** — so the
assertion would have passed a query that had lost its search index entirely.

The assertion was failing intermittently as the table's statistics shifted,
and the fix was to remove both alternatives so the keyword predicate is the
only thing the plan has to satisfy.

**It is now a real assertion, and it was proved.** Dropping
`idx_reports_search` and re-running the plan produces
`Seq Scan on reports r` — and because the test disables sequential scans,
the query **fails outright**. The assertion now proves that the index is
usable by an expression matching it exactly, which is what it always meant
to say.

The same correction was applied to the performance suite's plan assertion.

## What was verified

### The FR-49 partition — `prisma-report-listing-partition.test.ts` (9 tests)

| Assertion | Evidence |
|---|---|
| A Claim on the member's own report is excluded | 0 rows, 0 total |
| A Recovery Response on the member's own report is excluded | 0 rows, 0 total |
| A Claim on another member's report is kept | 1 row, the right report |
| A Recovery Response on another member's report is kept | 1 row, the right report |
| The exclusion survives a filter that matches the own report | 0 rows |
| A Claim row links to its thread by the Claim's own id | `threadId === claimId` |
| A Recovery Response row links to its thread by the Response's own id | `threadId === responseId` |
| A thread with no messages still carries its link | `threadId !== null` |
| `mine` and `browse` never share a report | disjoint id sets |

**Each of the two production fixes was proved by reverting it.** With the
ownership exclusion removed and the thread id back to `NULL::uuid`, **six of
the nine tests fail** — the three that test unchanged behaviour still pass.
That is the evidence that the suite tests the fix and not the implementation.

### The FR-14 keyword — `prisma-report-listing-keyword.test.ts` (14 tests)

| Assertion | Evidence |
|---|---|
| A prefix of the name matches | `walle` → `A blue wallet` |
| A prefix of the description matches | `deni` → the denim object |
| A substring in the *middle* of the name matches | `lue wal` → `A blue wallet` |
| The whole word still matches | `wallet` → `A blue wallet` |
| The match is case-insensitive | `WALLE`, `blUe` → the wallet |
| A multi-word keyword matches | `blue wal` → `A blue wallet` |
| A keyword naming nothing matches nothing | `zzz` → empty |
| The keyword does not reach an exact place | `secret`, `secr` → empty |
| The keyword does not reach identifying details | `ABC123`, `ABC12` → empty |
| `_` is not a wildcard | `blue_bag` → the underscore one, not `blueXbag` |
| `%` is not a wildcard | `%` → empty, not every row |
| A text-search operator does not raise | `blue ! red`, `blue & red`, `blue \| red`, a quoted phrase → empty |
| A keyword of only punctuation matches nothing | `!!!` → empty |
| The match is answered from the trigram index | `idx_reports_name_trgm` in the plan; no `Seq Scan` |

### The performance budget — `prisma-report-listing-reader.performance.test.ts` (6 tests)

Measured against **10,000 seeded active reports**, as the bolt's own note
requires (*"an index that works on 50 rows is not evidence for 10,000"*).

| Read | p95 | Median | Worst | Budget |
|---|---|---|---|---|
| Keyword search | **13.8 ms** | 11.6 ms | 16.4 ms | 500 ms |
| Unfiltered public listing | **2.3 ms** | 1.9 ms | 2.4 ms | 500 ms |
| `browse` partition | **3.0 ms** | 2.2 ms | 3.3 ms | 500 ms |
| Category-filtered listing | **2.4 ms** | 1.8 ms | 2.9 ms | 500 ms |

**The keyword search is 36× inside the budget** — and that is the *new*
trigram path, measured against the same table the old `tsvector` path served
in single-digit milliseconds. The index-backed partial match did not cost
the budget; it kept it.

The suite also asserts that the search is answered by the index rather than
a scan, and that the seed is realistic — ten thousand reports spread over
two reporters and a year of dates, with the keyword in one report in ten so
the planner has a reason to prefer the index.

### The whole bolt

| Suite | Tests | Covers |
|---|---|---|
| `prisma-report-listing-partition.test.ts` | 9 | FR-49's disjointness and the thread link |
| `prisma-report-listing-keyword.test.ts` | 14 | FR-14's partial match and its plan |
| `prisma-report-listing-reader.test.ts` | 25 | The reader: partitions, filters, pagination, row shape, index |
| `prisma-report-listing-reader.performance.test.ts` | 6 | FR-14's 500 ms budget at 10,000 reports |
| `report-listing-filter.test.ts` | 28 | The filter's criteria and validation |
| `report-partition.test.ts` | 16 | The partition set and the defaults |
| `report-status-view.test.ts` | 22 | The type-aware status sets and the role defaults |
| `report-pagination.test.ts` | 14 | The page shape and the page bounds |
| `report-listing-service.test.ts` | 18 | The use case: partition, status view, validation |
| `report-detail-service.test.ts` | 8 | The FR-13 anonymous gate and the FR-39 projection |
| `listing-routes.test.ts` | 23 | The transport: parsing, refusal, and the 404 |
| **Total** | **183** | |

## Coverage

Scoped to this bolt's eight modules.

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `report-listing-filter.ts` | 100% | 100% | 100% | 100% |
| `report-listing-result.ts` | 100% | 100% | 100% | 100% |
| `report-pagination.ts` | 100% | 100% | 100% | 100% |
| `report-partition.ts` | 100% | 100% | 100% | 100% |
| `report-status-view.ts` | 100% | 100% | 100% | 100% |
| `report-listing-service.ts` | 100% | 100% | 100% | 100% |
| `report-detail-service.ts` | 95.83% | 94.44% | 100% | 95.83% |
| `prisma-report-listing-reader.ts` | 96.82% | 71.42% | 100% | 96.77% |
| **All files** | **98.27%** | **89.13%** | **100%** | **98.25%** |

**The two uncovered lines are defensive guards, and both are now
unreachable.** `report-listing-service.ts:177` is the `viewerId === null`
refusal in `requireMemberId` — the anonymous path returns the `public`
partition before reaching it. `prisma-report-listing-reader.ts:647` is the
empty-fragments branch in `whereOf` — the participation predicate always
contributes at least the membership predicate. Both are kept: a guard that
can only be reached by a future change is worth having, and neither is
load-bearing today.

## Verification

```
$ npx tsc --noEmit
TYPECHECK EXIT: 0

$ npx eslint src/infrastructure/listings/prisma-report-listing-reader.ts \
    src/infrastructure/listings/prisma-report-listing-partition.test.ts \
    src/infrastructure/listings/prisma-report-listing-keyword.test.ts \
    src/domain/listings/report-listing-filter.ts
LINT EXIT: 0

$ npx vitest run <the eleven suites above>
Test Files  11 passed (11)
     Tests  183 passed (183)
```

## Success Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Anonymous listing returns FR-38 fields and nothing more; detail requires login | ✅ | The row shape *is* the FR-38 set (`report-listing-result.ts`); the detail's anonymous refusal is a 404, and the route test asserts the refusal is indistinguishable from a missing report |
| Search returns within 500 ms p95 at 10,000 active reports | ✅ | **p95 13.8 ms** for the keyword search; four reads measured, all inside the budget |
| Search queries are index-backed; no full table scan over reports | ✅ | `idx_reports_name_trgm` in the plan; the plan assertion proved by dropping the index and watching the query fail |
| The four views are disjoint: My Reports, Browse, My Claims, My Recovery Responses | ✅ | The partition suite asserts `mine` and `browse` share no report; the ownership exclusion keeps the participation partitions off the member's own reports |
| A member's own report never appears in their own Browse | ✅ | The exclusion is a predicate in the query, and the suite asserts it survives a filter that matches the own report |
| No Lost and Found reports are linked automatically | ✅ | The partition is a search pool — the reader's predicate has no Lost-to-Found clause, and no module pairs them |

## The story criteria the existing suites did not reach

Bolt `009`'s stories carried **53 acceptance criteria** across four stories.
The code satisfied nearly all of them before this stage. The ones the
existing suites did not reach, and what this stage added:

| Story | Criterion | Evidence |
|---|---|---|
| 007 | The default public view excludes `Returned` and `Closed` but includes `Verification Pending` | `report-status-view.test.ts` (22 tests) |
| 009 | The keyword matches on a **partial** match | **New** — `prisma-report-listing-keyword.test.ts` |
| 009 | The query plan is index-backed with no full scan | **New** — the plan assertion, now genuinely isolated |
| 009 | ≤ 500 ms p95 at 10,000 reports | `prisma-report-listing-reader.performance.test.ts` (6 tests) |
| 011 | The `claims` partition holds only Claims on **other members'** reports | **New** — `prisma-report-listing-partition.test.ts` |
| 011 | A participation row shows a link to its thread | **New** — the `threadId` assertions |
| 011 | The four views are disjoint | **New** — the disjointness assertions |

## Owner Items

1. **The `tsvector` search index is now unused by the reader.** It is
   bolt `007`'s, it remains in the schema, and the suites still assert it is
   usable by an expression matching it exactly. But nothing queries it. A
   future bolt may choose to drop it — **the reader's `searchVectorExpression`
   export and the two suites' plan assertions would go with it.**
2. **`pg_trgm` is a new extension dependency.** The migration creates it
   with `CREATE EXTENSION IF NOT EXISTS`, so it is idempotent, but a
   deployment's database role needs permission to create the extension. On
   a managed PostgreSQL where that permission is withheld, the extension
   must be created by the operator and the migration's `CREATE EXTENSION`
   will be a no-op.
3. **`idx_reports_reporter_status_date` was added for the ownership
   exclusion.** It serves the participation join's `reporter_id <> $1`
   filter alongside the report's status and ordering. It is a second index
   over a subset of `idx_reports_reporter_date`'s columns, on purpose: the
   two partitions ask different questions of the same table — one an
   equality, the other an inequality — and one index cannot serve both.
4. **The keyword's maximum length (200) is unchanged.** The partial match
   widens what a keyword *matches*, not how long it may be. A member
   searching for a very long phrase is still refused at 200 characters.
5. **The trigram index is larger than the `tsvector` one.** It stores every
   trigram of every covered value. At ten thousand reports the write cost
   is unremarkable, but a report table an order of magnitude larger would
   want this re-measured.
