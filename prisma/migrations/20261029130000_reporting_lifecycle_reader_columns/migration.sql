-- The columns bolt `006`'s visibility readers select.
--
-- Bolt `008` created `claims` and `recovery_responses` with only the columns
-- FR-10's delete gate and FR-11's withdrawal gate read — the status
-- vocabulary and the foreign keys. But bolt `006` already wrote three
-- visibility readers against these tables, and it left a standing
-- obligation: *"the obligation, stated now so it cannot be forgotten: when
-- bolt `008` creates these tables, the columns below are the ones the
-- readers already select."*
--
-- This migration discharges that obligation.
--
-- **The columns are the readers', not the gates'.** The readers project a
-- Claim and a Recovery Response to a viewer, so they need the whole record:
-- when it was submitted, what the claimant says about it, and — for the
-- FR-37 Sensitive Fields — what the responder observed.
--
-- **Every column is nullable.** The tables were created empty and Units 003
-- and 004 own the columns' *content*; this migration adds the shape only.
-- A row written before this migration carries `NULL` in the new columns, so
-- a nullable column is the only honest choice — a `NOT NULL` column with no
-- default would refuse the rows that already exist.
--
-- **`submitted_at` is the timestamp the readers order by,** and it is
-- nullable for the same reason the others are: the existing rows have no
-- submission time recorded.
--
-- Changes, in order:
--   1. Add the Claim columns bolt `006`'s reader selects.
--   2. Add the Recovery Response columns bolt `006`'s reader selects.
--   3. Index `submitted_at` on both, for the readers' ordering.

-- ── 1. `claims` ───────────────────────────────────────────────────────────
--
-- `reason`, `identifying_details`, and `date_lost` are the Claim's own
-- evidence — what the claimant says about the item. `identifying_details`
-- is an FR-37 Sensitive Field, so the reader only selects it for a column
-- set that may see the Claim at all.
ALTER TABLE "claims"
    ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "reason" TEXT,
    ADD COLUMN IF NOT EXISTS "identifying_details" TEXT,
    ADD COLUMN IF NOT EXISTS "date_lost" DATE;

-- ── 2. `recovery_responses` ───────────────────────────────────────────────
--
-- `where_found_exact_place`, `observed_identifying_details`,
-- `candidate_image_ref`, and `date_found` are the responder's account of
-- where the item was found. Three of the four are FR-37 Sensitive Fields.
ALTER TABLE "recovery_responses"
    ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "where_found_exact_place" TEXT,
    ADD COLUMN IF NOT EXISTS "observed_identifying_details" TEXT,
    ADD COLUMN IF NOT EXISTS "candidate_image_ref" TEXT,
    ADD COLUMN IF NOT EXISTS "date_found" DATE;

-- ── 3. The readers' ordering ──────────────────────────────────────────────
--
-- The readers order a report's Claims and Responses by when they were
-- submitted. The index's leading column is `report_id` — the reader's
-- filter — and `submitted_at` is the ordering column.
CREATE INDEX IF NOT EXISTS "idx_claims_report_submitted_at"
    ON "claims" ("report_id", "submitted_at");

CREATE INDEX IF NOT EXISTS "idx_recovery_responses_report_submitted_at"
    ON "recovery_responses" ("report_id", "submitted_at");
