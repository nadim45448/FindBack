-- The Returned confirmation table — FR-23, FR-24, and FR-25's write-side
-- invariants.
--
-- Implements `memory-bank/bolts/019-returns-closeout/` § Data Persistence.
--
-- Bolt `019` is the first bolt to write the `Returned` transition. Both
-- recovery directions converge on it: a Found report is confirmed from
-- `Claim Approved` with the approved claimant as the default receiver, and a
-- Lost report from `Verification Pending` with the Lost-report owner.
--
-- Changes:
--   1. Create the `return_confirmations` table.
--   2. Add FR-25's **no-receiver-no-Returned** CHECK constraint.
--   3. Add the **one-confirmation-per-report** unique constraint.
--   4. Add the two supporting indexes.
--
-- The report's status vocabulary is **not** re-declared here: bolt `007`
-- already created `reports_status_check`, and it admits `Returned` — the
-- status this bolt writes. A second constraint would be a duplicate rather
-- than a tightening.
--
-- ── 1. The table ───────────────────────────────────────────────────────────
--
-- **The table exists so that "an item is marked recovered" and "somebody was
-- answerable for it" are the same fact.** Before it, the report's status
-- said an item was returned and nothing said who received it. FR-25 says
-- *"The system refuses to confirm Returned without a recorded receiver
-- (default or substitute)"*, and a rule about a recorded receiver needs
-- somewhere for the record to live.
--
-- **The default receiver is an account, and the substitute is a name.** The
-- distinction is deliberate and it is FR-24's: a substitute is frequently
-- someone with no account at all — a passerby, a family member, a classmate
-- — and FR-24 records the administrator's affirmation, not an identity.
-- So `default_receiver_account_id` is a UUID and `substitute_receiver_name`
-- is free text.
--
-- **`default_receiver_account_id` is NOT NULL.** Every confirmation has a
-- default receiver, because the *authorization* of a substitution is the
-- default receiver's consent — and without the default receiver there is
-- nobody whose consent could be recorded. A Found report with no approved
-- Claim therefore cannot be confirmed at all, which is the domain's rule
-- rather than this table's, and the table simply reflects it.
--
-- **`report_type` is copied from the report row, not supplied by a client.**
-- The event the confirmation writes differs by direction — events 6 and 7
-- for a Found report, events 21 and 22 for a Lost one — so the trail needs
-- to know which direction it is in. The column is the copy; the client
-- never writes it.
--
-- The two Accounts are **RESTRICT**: an account cannot be deleted while it
-- is recorded as having confirmed a return, or while it is answerable for a
-- returned item. Accounts are never deleted under FR-5 in any case, but
-- stating the rule in the schema means the database enforces it rather than
-- a comment describing an intention.
--
-- The report is **CASCADE**, for the same PRD §10 reason as the Claims and
-- the Recovery Responses: a confirmation is retained for the parent report's
-- lifetime, and the FR-10 hard-delete path removes the report and
-- everything hanging from it.

CREATE TABLE IF NOT EXISTS "return_confirmations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "report_type" TEXT NOT NULL,
    "default_receiver_account_id" UUID NOT NULL,
    "substitute_receiver_name" TEXT,
    "authorization_affirmation" TEXT,
    "relationship" TEXT,
    "administrator_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_confirmations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "return_confirmations_report_type_check"
        CHECK ("report_type" IN ('Lost', 'Found')),
    CONSTRAINT "return_confirmations_relationship_check"
        CHECK (
            "relationship" IS NULL
            OR "relationship" IN ('Friend', 'Family Member', 'Colleague', 'Classmate', 'Other')
        ),
    CONSTRAINT "return_confirmations_substitute_name_length_check"
        CHECK (
            "substitute_receiver_name" IS NULL
            OR (
                length(btrim("substitute_receiver_name")) BETWEEN 1 AND 80
                AND "substitute_receiver_name" = btrim("substitute_receiver_name")
            )
        ),

    CONSTRAINT "return_confirmations_report_id_fkey"
        FOREIGN KEY ("report_id") REFERENCES "reports" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "return_confirmations_administrator_id_fkey"
        FOREIGN KEY ("administrator_id") REFERENCES "accounts" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "return_confirmations_default_receiver_account_id_fkey"
        FOREIGN KEY ("default_receiver_account_id") REFERENCES "accounts" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── 2. FR-25's guard ───────────────────────────────────────────────────────
--
-- **The constraint is the rule; the domain's check is the explanation.**
-- FR-25: *"The system refuses to confirm Returned without a recorded
-- receiver (default or substitute)."* The domain's decision refuses a
-- confirmation with no receiver before anything is written — but the domain
-- is a layer of application code, and a path that bypassed it could write a
-- receiverless row. The constraint cannot be bypassed.
--
-- **The "no receiver at all" case is already impossible, and that is the
-- point.** `default_receiver_account_id` is `NOT NULL`, so a row with no
-- receiver of any kind cannot be written — the receiverless state FR-25
-- forbids is not merely discouraged, it is *unrepresentable*. That is what
-- makes the guard structural rather than procedural.
--
-- **What remains for the constraint to say is the substitute's
-- all-or-nothing.** A row with a substitute's name but no authorization, or
-- an authorization but no relationship, would be a partial record of a
-- handover nobody authorized. FR-24 says *"All three fields are required
-- when the substitute is not the claimant"*, and the constraint says the
-- same thing in the place where it cannot be skipped.
--
-- **So the check is exactly that disjunction:** either all three
-- substitute fields are null (a default-receiver confirmation), or all three
-- are present (a substitute confirmation). There is no third shape.

ALTER TABLE "return_confirmations"
    ADD CONSTRAINT "return_confirmations_receiver_present_check"
    CHECK (
        (
            "substitute_receiver_name" IS NULL
            AND "authorization_affirmation" IS NULL
            AND "relationship" IS NULL
        )
        OR (
            "substitute_receiver_name" IS NOT NULL
            AND "authorization_affirmation" IS NOT NULL
            AND "relationship" IS NOT NULL
        )
    );

-- ── 3. One confirmation per report ─────────────────────────────────────────
--
-- **The report's `Returned` status is terminal, so a second confirmation is
-- not a second fact about the same handover — it is a second handover, which
-- cannot exist.** The unique constraint is the data layer's version of
-- *"exactly one commits"*: the second of two concurrent administrators'
-- confirmations fails here rather than leaving a second row beside a
-- report that was already `Returned`.
--
-- The report's status write is *also* conditional — the adapter's
-- `UPDATE … WHERE status = <precondition>` — so the two mechanisms agree:
-- the status write settles which confirmation won, and the constraint
-- refuses a duplicate even if a path reached it another way.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_return_confirmations_report_id"
    ON "return_confirmations" ("report_id");

-- ── 4. The supporting indexes ──────────────────────────────────────────────
--
-- **The administrator's own confirmations,** for the administrator's
-- activity view — "what did this administrator confirm, and when?".
--
-- **The default receiver's answered-for items,** for the receiver's own
-- view — "which items were handed to me?" The default receiver is the
-- approved claimant on a Found report and the Lost-report owner on a Lost
-- one, and the item's fate after the hand-off is theirs to know.

CREATE INDEX IF NOT EXISTS "idx_return_confirmations_administrator_confirmed"
    ON "return_confirmations" ("administrator_id", "confirmed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_return_confirmations_receiver_confirmed"
    ON "return_confirmations" ("default_receiver_account_id", "confirmed_at" DESC);
