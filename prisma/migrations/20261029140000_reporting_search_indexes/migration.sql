-- The indexes FR-14's search and partitions need.
--
-- **The keyword search index already exists.** Bolt `007` created
-- `idx_reports_search` — a GIN index over
-- `to_tsvector('simple', name || ' ' || description)` — and this bolt's
-- first draft created a *second* one over the same columns with a
-- `coalesce` wrapper. Two indexes over one surface is a second answer to
-- "what does the keyword search match", and a second GIN index costs a
-- second index maintenance on every write for no benefit. So this
-- migration does **not** create a keyword index: it drops the duplicate
-- and keeps bolt `007`'s.
--
-- The reader's expression is therefore bolt `007`'s expression exactly —
-- `to_tsvector('simple', name || ' ' || description)` — with no
-- `coalesce`.
--
-- **`coalesce` is not needed.** `name` and `description` are `NOT NULL`,
-- so the `||` can never collapse the whole vector to `NULL`. Bolt `007`
-- declared them so, and this migration does not change that.
--
-- **The index covers `name` and `description` only.** `exact_place` and
-- `identifying_details` are FR-37 Sensitive Fields. A GIN index over them
-- would let a caller who does not hold the Sensitive Fields **infer** that
-- a word appears in one — the index would have to contain the value, and
-- the index is readable by the query planner whether or not the row is.
-- Excluding them is what makes "a keyword that would match Sensitive
-- Fields only matches nothing" true at the index level rather than only in
-- the query's `WHERE` clause.
--
-- **`'simple'` is deliberate.** The `english` configuration stems words and
-- drops stop words — so a search for "lost" would not match "lose", and a
-- search for "the" would match nothing. FR-14 specifies a **case-insensitive
-- partial match** against name and description, not a linguistic search, so
-- the `simple` configuration is the one that implements it: no stemming, no
-- stop words, and the lower-casing that gives the case-insensitivity.
--
-- **The index is a `GIN` over a `tsvector`,** which is what PostgreSQL
-- offers for full-text search, and what makes the query index-backed rather
-- than a sequential scan over the reports table. FR-14's performance target
-- — ≤ 500 ms p95 at 10,000 active reports — is not deliverable without it.
--
-- The `to_tsvector` expression must match the query's expression exactly,
-- or the index is not used. Both are
-- `to_tsvector('simple', name || ' ' || description)`.
--
-- Changes, in order:
--   1. The duplicate keyword search index is dropped.
--   2. The partition indexes for `mine` and `browse`.
--   3. The participation indexes for `claims` and `recovery_responses`.

-- ── 1. The duplicate keyword search index ─────────────────────────────────
--
-- **The duplicate is dropped, not the original.** Bolt `007`'s
-- `idx_reports_search` is the index the reader's expression matches, so
-- that is the one that stays.
DROP INDEX IF EXISTS "idx_reports_search_vector";

-- ── 2. The partition indexes ──────────────────────────────────────────────
--
-- **`mine` orders by date, most recent first, filtered by reporter.** The
-- existing `idx_reports_reporter_created` is on `(reporter_id,
-- created_at DESC)` — but the listing orders by the report's **`date`**, not
-- its creation timestamp. A report found yesterday may have been created
-- today, and a report created today may be dated last month. The listing's
-- ordering column is the one the index must carry.
--
-- **`browse` orders by date, filtered by status, excluding the viewer's own
-- reports.** The existing `idx_reports_status_created` is on `(status,
-- created_at DESC)` — the same mismatch. The exclusion of the viewer's own
-- reports is a `reporter_id <> $1` predicate, which is not itself
-- indexable as a leading column; the index serves the status filter and
-- the ordering, and the exclusion is applied to the rows the index yields.
--
-- These are **additional** indexes rather than replacements for the
-- existing ones: `created_at` serves the audit trail's "most recent
-- activity" ordering, which is a different question from the listing's
-- date ordering.
CREATE INDEX IF NOT EXISTS "idx_reports_reporter_date"
    ON "reports" ("reporter_id", "date" DESC);

CREATE INDEX IF NOT EXISTS "idx_reports_status_date"
    ON "reports" ("status", "date" DESC);

-- ── 3. The participation indexes ──────────────────────────────────────────
--
-- **`claims` lists a member's Claims by when they were submitted.** The
-- leading column is the claimant — the member — and the ordering column is
-- the submission timestamp.
--
-- **`recovery_responses` does the same** for the responder.
--
-- Both are the participation partitions' own access path. Without them,
-- "my Claims" would scan every Claim in the table to find the member's.
CREATE INDEX IF NOT EXISTS "idx_claims_claimant_submitted_at"
    ON "claims" ("claimant_id", "submitted_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_recovery_responses_responder_submitted_at"
    ON "recovery_responses" ("responder_id", "submitted_at" DESC);
