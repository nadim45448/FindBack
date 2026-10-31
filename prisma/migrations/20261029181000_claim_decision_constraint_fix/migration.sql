-- The decided-Claim constraint, corrected.
--
-- Implements `memory-bank/bolts/016-claim-decisions/` § Data Persistence.
--
-- **The first version of this constraint was wrong, and this migration
-- replaces it.** It required every decided Claim to carry a
-- `decided_by_administrator_id`. But **not every decision is an
-- administrator's**: story 006 names three auto-rejection triggers, and
-- one of them — the reporter's withdrawal (FR-11) — is caused by a
-- *member*. A Claim auto-rejected by a withdrawal has no administrator to
-- name as its decider, so the first constraint would have **refused the
-- withdrawal's own auto-rejection**.
--
-- **The corrected constraint requires the decision time and leaves the
-- decider optional.** The reason the decider is optional is the same
-- reason the human who caused the decision is recorded on the *audit
-- event* rather than on the Claim: event 5 carries `triggeredBy`, which
-- names the administrator **or** the reporter whose action caused the
-- auto-rejection. The Claim row records *that* it was decided and *when*;
-- the trail records *why* and *by whose action*.
--
-- **A `Pending` Claim carries no decision time.** The two halves are
-- checked together, so a row can never have a decision time without
-- being decided, nor be decided without a time.

ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "claims_decision_fields_check";

ALTER TABLE "claims" ADD CONSTRAINT "claims_decision_fields_check" CHECK (
    ("status" = 'Pending' AND "decided_at" IS NULL)
    OR (
        "status" <> 'Pending'
        AND "decided_at" IS NOT NULL
    )
);
