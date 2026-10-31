-- The Claim submission constraints — FR-15's write-side invariants.
--
-- Implements `memory-bank/bolts/013-claim-submit/` § Data Persistence.
--
-- The `claims` table was created empty by bolt `008`, which needed only the
-- status vocabulary and the foreign keys for FR-10's delete gate and FR-11's
-- withdrawal gate. Bolt `013` is the first bolt to **write** a Claim, so it
-- is the bolt that owns the table's submission-side constraints.
--
-- Changes, in order:
--   1. Add the `reason`, `identifying_details`, `date_lost`, and
--      `submitted_at` columns the submission writes.
--   2. Add the CHECK constraints on those columns.
--   3. Add the **one-Pending-Claim-per-item-per-member** uniqueness
--      constraint.
--   4. Add the index the uniqueness constraint's enforcement and the
--      duplicate check's read both use.
--
-- **The uniqueness constraint is the rule; the application check is the
-- explanation.** The story is explicit: "The one-`Pending`-Claim-per-item-
-- per-member rule is enforced by a database uniqueness constraint, not only
-- by an application check." A partial unique index — over the rows whose
-- status is `Pending`, and over the pair `(report_id, claimant_id)` — is
-- the only way to express "one *pending* claim" in SQL. A member whose claim
-- was rejected may claim again, and that new Claim sits alongside the
-- retained history, so a plain unique index on the pair would be wrong: it
-- would forbid the second claim the PRD allows.
--
-- **The constraint is what makes two simultaneous submissions correct.**
-- The application's duplicate check reads first and writes second, so two
-- requests racing could both pass it. The constraint cannot race: PostgreSQL
-- serialises the two inserts on the index, and the second one fails.

-- ── 1. The submission columns ────────────────────────────────────────────
--
-- **All four are nullable, because bolt `008` created the table before the
-- submission flow existed.** The columns are added empty and the submission
-- path fills them; a Claim row written by any other path keeps its nulls.
-- The CHECK constraints below therefore permit null — and a Claim that is
-- `Pending` is required to carry all three, which is what the *conditional*
-- CHECK enforces.

ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "reason" TEXT;

ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "identifying_details" TEXT;

ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "date_lost" DATE;

ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ(6);

-- ── 2. The CHECK constraints ──────────────────────────────────────────────
--
-- **A `Pending` Claim carries all three fields; a decided Claim need not.**
-- The bound is the FR-14 rule applied to a claim field: at most 365 days old
-- and never in the future. The *length* bounds are the domain's — the reason
-- is 20–1000 characters and the identifying details are 10–500 — and the
-- constraint restates them so that a row written by any path holds them.
--
-- **The length is measured with `char_length`,** which counts characters
-- rather than bytes, the same way the domain's `Array.from(text).length`
-- counts code points. An emoji is one character to the member and one
-- character to the constraint.
--
-- **The date bound is relative to `CURRENT_DATE`,** so the constraint is
-- evaluated against the database's own clock. The domain applies the same
-- rule with an injected clock; the constraint is the second line of defence
-- that holds even if a path bypasses the validator.

ALTER TABLE "claims" ADD CONSTRAINT "claims_reason_length_check" CHECK (
    "reason" IS NULL OR char_length("reason") BETWEEN 20 AND 1000
);

ALTER TABLE "claims" ADD CONSTRAINT "claims_identifying_details_length_check" CHECK (
    "identifying_details" IS NULL OR char_length("identifying_details") BETWEEN 10 AND 500
);

ALTER TABLE "claims" ADD CONSTRAINT "claims_date_lost_bound_check" CHECK (
    "date_lost" IS NULL
    OR ("date_lost" <= CURRENT_DATE AND "date_lost" >= CURRENT_DATE - INTERVAL '365 days')
);

-- A Pending Claim carries all three submission fields. A decided Claim keeps
-- what it had, and is not required to carry them.
ALTER TABLE "claims" ADD CONSTRAINT "claims_pending_fields_check" CHECK (
    "status" <> 'Pending'
    OR (
        "reason" IS NOT NULL
        AND "identifying_details" IS NOT NULL
        AND "date_lost" IS NOT NULL
        AND "submitted_at" IS NOT NULL
    )
);

-- ── 3. The one-Pending-Claim-per-item-per-member constraint ──────────────
--
-- **A partial unique index, not a plain unique constraint.** The rule bounds
-- *pending* Claims: a member whose Claim was rejected may claim again, and
-- the new Claim sits alongside the retained history. A plain unique index on
-- `(report_id, claimant_id)` would forbid the second Claim the PRD allows.
--
-- **`WHERE "status" = 'Pending'`** is what makes it partial, and therefore
-- what makes the second Claim possible once the first is decided.

CREATE UNIQUE INDEX "uq_claims_one_pending_per_report_per_claimant"
    ON "claims" ("report_id", "claimant_id")
    WHERE "status" = 'Pending';

-- ── 4. The supporting index ───────────────────────────────────────────────
--
-- **The duplicate check's read:** "does this member have a Pending Claim on
-- this report?" The index's leading column is `report_id` and it covers
-- `claimant_id`, so the read is index-only.
--
-- **The index also serves the uniqueness constraint's enforcement**, which
-- is why the two are one index rather than two: a second index on the same
-- pair would be a duplicate of the unique one, minus the uniqueness.

CREATE INDEX "idx_claims_report_claimant_status"
    ON "claims" ("report_id", "claimant_id", "status");
