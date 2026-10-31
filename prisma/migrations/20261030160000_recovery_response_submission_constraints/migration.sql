-- The Recovery Response submission constraints — FR-40 and FR-44's write-side
-- invariants.
--
-- Implements `memory-bank/bolts/015-lost-response-submit/` § Data
-- Persistence.
--
-- The `recovery_responses` table was created empty by bolt `008`, which needed
-- only the status vocabulary and the foreign keys for FR-10's delete gate and
-- FR-11's withdrawal gate. Bolt `015` is the first bolt to **write** a
-- Recovery Response, so it is the bolt that owns the table's submission-side
-- constraints.
--
-- Changes, in order:
--   1. Add the `campus_area` column FR-44 requires and the submission
--      writes.
--   2. Add the CHECK constraints on the submitted fields.
--   3. Add the **one-live-response-per-responder-per-report** uniqueness
--      constraint.
--   4. Add the index the uniqueness constraint's enforcement and the
--      duplicate check's read both use.
--
-- **The uniqueness constraint is the rule; the application check is the
-- explanation.** The rule is FR-40's: "One active response per responder per
-- Lost report" — at most one *non-terminal* Recovery Response on a given
-- report. A partial unique index — over the rows whose status is one of the
-- three non-terminal statuses, and over the pair `(report_id, responder_id)` —
-- is the only way to express "one *active* response" in SQL. A responder
-- whose response was `Not a Match` may respond again, and the new response
-- sits alongside the retained history, so a plain unique index on the pair
-- would be wrong: it would forbid the second response the PRD allows.
--
-- **The constraint is what makes two simultaneous submissions correct.** The
-- application's duplicate check reads first and writes second, so two
-- requests racing could both pass it. The constraint cannot race: PostgreSQL
-- serialises the two inserts on the index, and the second one fails.
--
-- **`Match Confirmed` is in the constrained set, and that is the subtle
-- part.** FR-41 makes it *non-terminal* — the Lost report stays `Verification
-- Pending` until an administrator confirms the physical hand-off — so a
-- responder holding one still holds a live response and may not add another.
-- A constrained set that omitted it would let the confirmed responder open a
-- second response on a report whose outcome is already settled.

-- ── 1. The campus area column ─────────────────────────────────────────────
--
-- **FR-44 makes the campus area a required field** of a Recovery Response:
-- "Where the item was found (campus area) | yes | enum | Fixed deployment
-- list". The table was created before the submission flow existed, so the
-- column is added here.
--
-- **The column is nullable, and the conditional CHECK below is what makes it
-- required for a submitted Response.** A row written by a lifecycle path —
-- a report's closure resolving its responses, say — carries no submission
-- fields at all, and the read must not fail on it.

ALTER TABLE "recovery_responses" ADD COLUMN IF NOT EXISTS "campus_area" TEXT;

-- ── 2. The CHECK constraints ──────────────────────────────────────────────
--
-- **A submitted Response carries all four fields; a lifecycle-written row need
-- not.** The length bounds are FR-44's own: the exact place is at most 200
-- characters (and may be empty — it is optional), and the observed
-- identifying details are 10–500 characters (and are required).
--
-- **The length is measured with `char_length`,** which counts characters
-- rather than bytes, the same way the domain's `Array.from(text).length`
-- counts code points. An emoji is one character to the member and one
-- character to the constraint.
--
-- **The exact place's lower bound is zero, not one, because the field is
-- optional.** FR-44 says "0-200 chars", and a responder who found the item in
-- a courtyard may say "the library courtyard" and nothing more. A constraint
-- of `>= 1` would forbid the empty string the PRD permits.
--
-- **The date bound is relative to `CURRENT_DATE`,** so the constraint is
-- evaluated against the database's own clock. The domain applies the same
-- rule with an injected clock; the constraint is the second line of defence
-- that holds even if a path bypasses the validator.

ALTER TABLE "recovery_responses" ADD CONSTRAINT "recovery_responses_where_found_length_check" CHECK (
    "where_found_exact_place" IS NULL OR char_length("where_found_exact_place") <= 200
);

ALTER TABLE "recovery_responses" ADD CONSTRAINT "recovery_responses_observed_details_length_check" CHECK (
    "observed_identifying_details" IS NULL
    OR char_length("observed_identifying_details") BETWEEN 10 AND 500
);

ALTER TABLE "recovery_responses" ADD CONSTRAINT "recovery_responses_date_found_bound_check" CHECK (
    "date_found" IS NULL
    OR ("date_found" <= CURRENT_DATE AND "date_found" >= CURRENT_DATE - INTERVAL '30 days')
);

-- A submitted Response carries all four submission fields. A lifecycle-written
-- Response keeps what it had, and is not required to carry them.
--
-- **The condition is `status = 'Submitted'`, not "not terminal".** A
-- Response that has been selected for verification, confirmed, or withdrawn
-- was submitted, and it carried the fields when it was submitted. The
-- constraint is about the *submission*, so it is anchored to the submission's
-- own status.
ALTER TABLE "recovery_responses" ADD CONSTRAINT "recovery_responses_submitted_fields_check" CHECK (
    "status" <> 'Submitted'
    OR (
        "campus_area" IS NOT NULL
        AND "observed_identifying_details" IS NOT NULL
        AND "date_found" IS NOT NULL
        AND "submitted_at" IS NOT NULL
    )
);

-- ── 3. The one-live-response-per-responder-per-report constraint ──────────
--
-- **A partial unique index, not a plain unique constraint.** The rule bounds
-- *live* responses: a responder whose Response was `Not a Match` may respond
-- again, and the new Response sits alongside the retained history. A plain
-- unique index on `(report_id, responder_id)` would forbid the second
-- Response the PRD allows.
--
-- **`WHERE "status" IN ('Submitted', 'Selected for Verification', 'Match
-- Confirmed')`** is what makes it partial, and therefore what makes the
-- second Response possible once the first is decided.
--
-- **The three statuses are the domain's non-terminal set.** They are the
-- statuses from which the Response can still move, and the domain's own
-- `NON_TERMINAL_RECOVERY_RESPONSE_STATUSES` is derived as the complement of
-- the terminal set — so this list and the domain's cannot disagree about
-- which statuses are live.

CREATE UNIQUE INDEX "uq_recovery_responses_one_live_per_report_per_responder"
    ON "recovery_responses" ("report_id", "responder_id")
    WHERE "status" IN ('Submitted', 'Selected for Verification', 'Match Confirmed');

-- ── 4. The supporting index ───────────────────────────────────────────────
--
-- **The duplicate check's read:** "does this responder have a live Response on
-- this report?" The index's leading column is `report_id` and it covers
-- `responder_id`, so the read is index-only.
--
-- **The index also serves the uniqueness constraint's enforcement**, which
-- is why the two are one index rather than two: a second index on the same
-- pair would be a duplicate of the unique one, minus the uniqueness.
--
-- **The `Match Confirmed` cutoff's read** — "has the selected response on
-- this report been confirmed?" — is served by the existing
-- `idx_recovery_responses_report_status`, whose leading column is
-- `report_id` and which covers `status`.

CREATE INDEX "idx_recovery_responses_report_responder_status"
    ON "recovery_responses" ("report_id", "responder_id", "status");
