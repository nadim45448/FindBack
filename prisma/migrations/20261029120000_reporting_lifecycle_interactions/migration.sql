-- The interaction tables — `claims` and `recovery_responses`.
--
-- Implements `memory-bank/bolts/008-reporting-lifecycle/ddd-01-domain-model.md`
-- § Data Persistence, and the Stage 1 decision recorded there: bolt `008`
-- needs to read the *existence* and *status* of the records that FR-10's
-- delete gate and FR-11's withdrawal gate depend on, but those records are
-- owned by Units 003 and 004.
--
-- The decision was to create the tables here, empty, rather than to leave
-- bolt `008` unable to be implemented or to fake the dependency with a
-- stub. The tables carry the **status vocabulary and the foreign keys** the
-- gates read — that is all FR-10 and FR-11 need — and the columns the later
-- units need are added by those units' own migrations.
--
-- Changes, in order:
--   1. Create `claims`.
--   2. Create `recovery_responses`.
--   3. Index both for the existence reads the gates perform.
--
-- **Both tables are created empty.** No content is invented here — the PRD
-- names the statuses and the relationships, and this migration creates the
-- shape, not the data.

-- ── 1. `claims` ───────────────────────────────────────────────────────────
--
-- A Claim is submitted against a **Found** report by a member who believes
-- the item is theirs.
--
-- **`status` is the PRD's vocabulary, verbatim** (FR-41): Pending, Approved,
-- Rejected, Returned. The CHECK constraint is the second line of defence —
-- the application validates the transition, and the constraint holds the
-- invariant even if a path bypasses it.
--
-- **`rejection_reason` carries the audit reason** for an auto-rejection —
-- "report withdrawn by reporter" (FR-11), "another claim was approved for
-- this item" (FR-17), "report closed by administrator" (FR-21/FR-36). It is
-- the reason the claimant is told, and it is part of the Claim's own record
-- so the Claim is self-describing.

CREATE TABLE "claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "claimant_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "claims_status_check" CHECK (
        "status" IN ('Pending', 'Approved', 'Rejected', 'Returned')
    ),

    -- A rejected Claim carries the reason it was rejected. A Claim that has
    -- not been rejected does not.
    CONSTRAINT "claims_rejection_reason_check" CHECK (
        ("status" = 'Rejected' AND "rejection_reason" IS NOT NULL)
        OR ("status" <> 'Rejected')
    )
);

-- A Claim belongs to a report. **ON DELETE CASCADE**, because PRD §10 says
-- the report's related Claims are removed with it under FR-10's hard delete.
ALTER TABLE "claims" ADD CONSTRAINT "claims_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Accounts are never deleted (FR-5), so this constraint never fires.
ALTER TABLE "claims" ADD CONSTRAINT "claims_claimant_id_fkey"
    FOREIGN KEY ("claimant_id") REFERENCES "accounts" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The existence read the FR-10 gate performs: "does any Claim exist on this
-- report?" The index's leading column is `report_id`, and it covers
-- `status` so the read is index-only.
CREATE INDEX "idx_claims_report_status" ON "claims" ("report_id", "status");

-- The withdrawal's read: the Pending Claims on a report, with the claimant's
-- address for the FR-29 notification.
CREATE INDEX "idx_claims_report_pending" ON "claims" ("report_id")
    WHERE "status" = 'Pending';

-- ── 2. `recovery_responses` ───────────────────────────────────────────────
--
-- A Recovery Response is submitted against a **Lost** report by a member who
-- believes they have found the item.
--
-- **`status` is the PRD's vocabulary, verbatim** (FR-41): Submitted, Selected
-- for Verification, Match Confirmed, Not a Match, Completed — Report
-- Returned, Resolved — Report Returned, Resolved — Report Closed, Withdrawn.

CREATE TABLE "recovery_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "responder_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_responses_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "recovery_responses_status_check" CHECK (
        "status" IN ('Submitted', 'Selected for Verification', 'Match Confirmed',
                     'Not a Match', 'Completed — Report Returned',
                     'Resolved — Report Returned', 'Resolved — Report Closed',
                     'Withdrawn')
    )
);

-- A Recovery Response belongs to a report. **ON DELETE CASCADE**, for the
-- same PRD §10 reason as the Claims.
ALTER TABLE "recovery_responses" ADD CONSTRAINT "recovery_responses_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Accounts are never deleted (FR-5), so this constraint never fires.
ALTER TABLE "recovery_responses" ADD CONSTRAINT "recovery_responses_responder_id_fkey"
    FOREIGN KEY ("responder_id") REFERENCES "accounts" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The existence read the FR-10 gate performs.
CREATE INDEX "idx_recovery_responses_report_status"
    ON "recovery_responses" ("report_id", "status");

-- The withdrawal's read: the non-terminal Recovery Responses on a report.
CREATE INDEX "idx_recovery_responses_report_non_terminal"
    ON "recovery_responses" ("report_id")
    WHERE "status" IN ('Submitted', 'Selected for Verification');
