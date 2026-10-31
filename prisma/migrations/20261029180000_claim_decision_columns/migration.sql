-- The Claim decision columns — FR-17's approval and FR-18's rejection.
--
-- Implements `memory-bank/bolts/016-claim-decisions/` § Data Persistence.
--
-- Bolt `013` created the `claims` table and taught it to hold a
-- *submission*. Bolt `016` is the first bolt to **decide** a Claim, so it
-- is the bolt that owns the table's decision-side columns.
--
-- Changes, in order:
--   1. Add the `decided_by_administrator_id` and `decided_at` columns a
--      decision records.
--   2. Add the CHECK constraint that a decided Claim carries them.
--   3. Add the foreign key on the deciding administrator.
--
-- **The decision columns are nullable, because a Claim that has not been
-- decided does not have them.** A `Pending` Claim has no decider and no
-- decision time; an `Approved` or `Rejected` Claim has both. The
-- conditional CHECK below is what expresses that, and it is the same shape
-- bolt `013`'s `claims_pending_fields_check` used — a conditional
-- requirement, rather than a requirement on every row.
--
-- **A `Rejected` Claim's reason is already required** by bolt 008's
-- `claims_rejection_reason_check`, so this migration does not restate it.
-- The auto-rejection writes the trigger's verbatim reason into the same
-- column, which is why that constraint holds for auto-rejections too.

-- ── 1. The decision columns ──────────────────────────────────────────────

ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "decided_by_administrator_id" UUID;

ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMPTZ(6);

-- ── 2. The decided-Claim constraint ──────────────────────────────────────
--
-- **A decided Claim carries its decision time.** A Claim that has not been
-- decided carries none.
--
-- **The decider is NOT required, because not every decision is an
-- administrator's.** Story 006 names three auto-rejection triggers, and
-- one of them — the reporter's withdrawal — is caused by a **member**, not
-- by an administrator. A Claim auto-rejected by a withdrawal has no
-- administrator to name as its decider.
--
-- **The human who caused the decision is on the audit event, not on the
-- Claim.** The trail's event 5 carries `triggeredBy`, which names the
-- administrator *or* the reporter whose action caused the auto-rejection.
-- That is the record of who caused it, and it is where an auditor reads
-- it — the Claim row records *that* it was decided and *when*, and the
-- trail records *why* and *by whose action*.
--
-- **A decider that IS recorded must be an administrator's id,** because
-- the only path that records one is an administrator's approve or reject.
-- The column is nullable precisely so the withdrawal's auto-rejection can
-- leave it null.
--
-- *(A later migration — `20261029181000_claim_decision_constraint_fix` —
-- replaces this constraint with the same definition, for a fresh database
-- that replays the whole history.)*

ALTER TABLE "claims" ADD CONSTRAINT "claims_decision_fields_check" CHECK (
    ("status" = 'Pending' AND "decided_at" IS NULL)
    OR (
        "status" <> 'Pending'
        AND "decided_at" IS NOT NULL
    )
);

-- ── 3. The deciding administrator's foreign key ──────────────────────────
--
-- **ON DELETE RESTRICT**, exactly as every other reference to an account
-- in this schema. An administrator's account cannot be deleted while they
-- are recorded as having decided a Claim — and a deleted account would
-- leave a Claim with a decider who no longer exists, which is precisely
-- the kind of hole the audit trail must not have.

ALTER TABLE "claims" ADD CONSTRAINT "claims_decided_by_administrator_id_fkey"
    FOREIGN KEY ("decided_by_administrator_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
