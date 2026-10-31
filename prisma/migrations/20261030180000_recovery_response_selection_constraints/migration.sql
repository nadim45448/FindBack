-- The Recovery Response selection constraints — FR-41's and FR-43's
-- write-side invariants for the owner's provisional selection.
--
-- Implements `memory-bank/bolts/017-lost-lifecycle-determination/`
-- § Data Persistence.
--
-- Bolt `015` owns the *submission* side of `recovery_responses`: the
-- one-live-response-per-responder-per-report constraint and the CHECK
-- constraints on the submission fields. Bolt `017` owns the *selection*
-- side: the one-selected-response-per-report constraint that FR-41 states as
-- "A Lost report may have exactly one Recovery Response in `Selected for
-- Verification` status at any time".
--
-- Changes:
--   1. Add the **one-selected-response-per-report** partial unique index.
--   2. Add the determination's two audit indexes.
--
-- The report's status vocabulary is **not** re-declared here: bolt `007`
-- already created `reports_status_check`, and it admits every status either
-- side uses — `Open`, `Claim Requested`, `Claim Approved`,
-- `Verification Pending`, `Returned`, and `Closed`. The Lost lifecycle's
-- statuses are inside that vocabulary, so a second constraint would be a
-- duplicate rather than a tightening.
--
-- The determination's two audit **columns** are also **not** re-declared
-- here: bolt `001` created them, and the reconciliation migration widened
-- them to `UUID`. This migration adds their read path.
--
-- ── 1. The one-selected-response-per-report index ──────────────────────────
--
-- **The index is the rule; the application's read-and-refuse check is the
-- explanation.** FR-43's selection service reads the report's currently
-- selected response and refuses a second selection — but two owner sessions
-- racing could both pass that read, because the read and the write are not
-- one atomic act. The index cannot race: PostgreSQL serialises the two
-- updates on the index, and the second one fails with a unique violation
-- that the adapter translates into `ConcurrentSelectionError`.
--
-- **The index is partial over exactly one status.** FR-41's rule bounds the
-- `Selected for Verification` status specifically — a report may hold any
-- number of `Submitted` responses (the siblings, on standby), and the
-- terminal statuses are history. So the constrained set is:
--
--     WHERE "status" = 'Selected for Verification'
--
-- **A plain unique index on `report_id` would be wrong.** It would forbid
-- the siblings outright — the report may hold many `Submitted` responses —
-- and it is exactly the sibling-preservation rule ("Selection never closes
-- or rejects a sibling") that this bolt must not break.
--
-- **`Match Confirmed` is deliberately NOT in the constrained set.** A
-- confirmed response has left `Selected for Verification`, so it does not
-- hold the report's selection slot. FR-43's rule about a confirmed match
-- ("`Match Confirmed` does NOT unlock another selection") is enforced by the
-- *domain* — the selection decision checks the confirmed outcome before it
-- checks anything else — and by the report's own status, which stays
-- `Verification Pending` and so fails the report-status whitelist. The index
-- is not asked to carry that rule, because a `Match Confirmed` response and a
-- newly selected response are not two selected responses.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_recovery_responses_one_selected_per_report"
    ON "recovery_responses" ("report_id")
    WHERE "status" = 'Selected for Verification';

-- The index also serves the selection facts' read — "which response is
-- selected on this report?" — and the `Match Confirmed` lock's read — "has
-- the selected response been confirmed?" The existing
-- `idx_recovery_responses_report_status` already covers `(report_id,
-- status)` and serves both, so no second supporting index is created here.

-- ── 2. The determination's audit indexes ───────────────────────────────────
--
-- **The two halves of a determination live in two different columns.** FR-43
-- and ADR-11 are explicit: the *maker* — the Lost report's owner, who
-- decided — and the *recorder* — the acting administrator, who wrote the
-- record — are two different facts, and a trail that stored them in one
-- column could not answer who actually decided.
--
-- **The columns already exist, and they are named as the audit module names
-- them.** Bolt `001` created `determinedByUserId` and
-- `recordedByAdministratorId` on the `audit_events` table, and the
-- reconciliation migration widened them to `UUID`. They are **nullable**,
-- and that is deliberate: the determination events (18 and 19) are the only
-- events that carry them, and the table holds events of every kind — the
-- submission, the selection, the transitions. A `NOT NULL` pair would be
-- refused by every event that has no determination to record.
--
-- **The maker is a server-side fact.** The column is written from the
-- report's owner read out of the database, never from a client-supplied
-- value, so a client cannot name a different maker and have it accepted.
--
-- **What is new here is the read path.** The audit trail already indexes
-- `acting_administrator_id` — but the determination's recorder is a
-- *reference* rather than a second source of truth (the administrator who
-- performed the write is the trail's own actor), so the "who recorded the
-- determination" read filters on the determination's own column. Without
-- these indexes that read is a sequential scan of the whole trail.
--
-- **The columns keep the audit module's own naming.** The `audit_events`
-- table predates the snake_case convention — bolt `001` created it with
-- camelCase columns and bolt `007` renamed only the *tables* — so these
-- indexes name the columns as they are, not as the convention would have
-- them.

CREATE INDEX IF NOT EXISTS "idx_audit_events_determined_by_user_id"
    ON "audit_events" ("determinedByUserId");

CREATE INDEX IF NOT EXISTS "idx_audit_events_recorded_by_administrator_id"
    ON "audit_events" ("recordedByAdministratorId");
