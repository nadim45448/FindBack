-- The per-Claim thread messages — FR-38's conversation record.
--
-- Implements `memory-bank/bolts/023-claim-threads/` § Data Persistence.
--
-- The `thread_messages` table is **not** new to this schema in the strict
-- sense: the visibility reader in `src/infrastructure/listings/
-- prisma-thread-visibility-reader.ts` has been querying it since bolt `008`,
-- and `physical-columns.ts` already names its columns. What has not existed
-- until now is the table itself, so this migration creates it to match the
-- reader that is already in the codebase.
--
-- **The table is polymorphic by parent, and the Claim column is what makes
-- the isolation real.** The reader filters on `(parent_type, parent_id)`,
-- because one thread belongs to a parent of some kind — a Claim, or (from
-- bolt `018`) a Recovery Response. The polymorphic pair is what the reader
-- filters on, but it is *not* enough on its own: a `parent_id` is only
-- meaningful together with the kind it is. So the table carries a
-- `claim_id` foreign key alongside it, and a CHECK constraint says that a
-- `claim` parent **must** name a real Claim in that column, and that a
-- `recovery_response` parent must not.
--
-- **That constraint is the isolation guarantee.** Without it, a row could
-- claim to be a `claim` parent while pointing at nothing, and a reader that
-- trusted `parent_id` alone would be reading a thread nobody owns.
--
-- **The body is plain text and nothing else, and the length is bounded at
-- the database layer.** The domain's `createClaimThreadMessageBody` bounds
-- the body at 1–2000 characters; the CHECK below restates that bound, so a
-- write that bypassed the domain still cannot leave an out-of-bounds message
-- on the record. The length is measured with `char_length`, which counts
-- characters rather than bytes — the same way the domain's
-- `Array.from(text).length` counts code points, so an emoji is one
-- character to the member and one character to the constraint.
--
-- **The author's display name is captured, not joined.** A thread reads as a
-- conversation, and a conversation whose authors are re-read from the
-- accounts table would change its wording every time an account is renamed.
-- The name is a record of who spoke.
--
-- **The foreign keys use the schema's two deletion idioms.**
--
--   - `claims` and `reports`: **ON DELETE CASCADE**, because PRD §10 says a
--     report's related Claims are removed with it under FR-10's hard delete,
--     and the thread is part of the Claim's record. A deleted item leaves no
--     orphan conversation.
--   - `accounts`: **ON DELETE RESTRICT**, exactly as every other reference
--     to an account in this schema. Accounts are never deleted (FR-5), and a
--     deleted account would leave a message attributed to someone who no
--     longer exists — precisely the kind of hole the audit trail must not
--     have.

-- ── 1. The table ─────────────────────────────────────────────────────────

CREATE TABLE "thread_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_type" TEXT NOT NULL DEFAULT 'claim',
    "parent_id" UUID NOT NULL,

    -- The report the thread belongs to.
    --
    -- **Denormalised from the Claim, and deliberately so.** The thread is
    -- addressed by its Claim, but the report is what the item's lifecycle
    -- and retention are measured in: a report's threads live exactly as
    -- long as the report does (PRD §10). Carrying the report id means the
    -- cascade from the report is direct rather than transitive, and it
    -- means the "every thread on this report" read — which the FR-10 and
    -- FR-11 gates both need — does not have to join through `claims`.
    "report_id" UUID NOT NULL,

    "claim_id" UUID,
    "author_id" UUID NOT NULL,
    "author_display_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_messages_pkey" PRIMARY KEY ("id"),

    -- The parent kinds the vocabulary owns. A kind the vocabulary does not
    -- own is refused, not stored and ignored: a row whose parent kind is
    -- misspelled would be invisible to every reader, which is a message
    -- written and lost.
    CONSTRAINT "thread_messages_parent_type_check" CHECK (
        "parent_type" IN ('claim', 'recovery_response')
    ),

    -- The body is bounded at the database layer. The domain bounds it too;
    -- this is the second line of defence that holds even if a path bypasses
    -- the validator.
    CONSTRAINT "thread_messages_body_length_check" CHECK (
        char_length("body") BETWEEN 1 AND 2000
    ),

    -- **The parent consistency constraint — the isolation guarantee.**
    --
    -- A `claim` parent names its Claim in `claim_id`, and a
    -- `recovery_response` parent names no Claim at all. The two are
    -- exclusive, and neither may be empty-handed: a `claim` parent without
    -- a `claim_id` is a thread nobody owns.
    CONSTRAINT "thread_messages_parent_claim_consistency_check" CHECK (
        ("parent_type" = 'claim' AND "claim_id" IS NOT NULL)
        OR ("parent_type" = 'recovery_response' AND "claim_id" IS NULL)
    ),

    -- The parent id and the Claim id agree. A `claim` parent whose
    -- `parent_id` and `claim_id` disagree would let the visibility reader —
    -- which filters on `parent_id` — hand one Claim's thread to another's
    -- reader.
    CONSTRAINT "thread_messages_parent_id_agrees_check" CHECK (
        "claim_id" IS NULL OR "parent_id" = "claim_id"
    )
);

-- ── 2. The foreign keys ──────────────────────────────────────────────────

-- The Claim the message hangs from. **ON DELETE CASCADE**, because the
-- message is part of the Claim's record: when the Claim goes, its thread
-- goes with it (PRD §10's retention rule, FR-10's hard delete).
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_claim_id_fkey"
    FOREIGN KEY ("claim_id") REFERENCES "claims" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The report the thread belongs to. **ON DELETE CASCADE**, for the same
-- reason as the Claim: the item's conversation is part of the item's
-- record, and a hard delete of the report takes its Claims and their
-- threads with it.
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The author. **ON DELETE RESTRICT**, as every other account reference in
-- this schema. Accounts are never deleted (FR-5), and a message attributed
-- to a deleted account would be a record of speech by someone who does not
-- exist.
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "accounts" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. The indexes ───────────────────────────────────────────────────────
--
-- **The parent index serves the thread read.** The visibility reader filters
-- on `(parent_type, parent_id)` and orders by `posted_at`; this index's
-- leading columns are that pair and its third column is `posted_at`, so the
-- read is index-only and already in the order it needs. The
-- `parent_type` column is the leading one because the reader's filter is a
-- disjunction over two parent kinds — a Claim filter and a Recovery
-- Response filter — and each branch is a contiguous range on this index.
CREATE INDEX "idx_thread_messages_parent_posted_at"
    ON "thread_messages" ("parent_type", "parent_id", "posted_at");

-- **The author index serves "this member's messages", newest first.**
-- The descending `posted_at` is the order the question is asked in, so the
-- index answers it without a sort.
CREATE INDEX "idx_thread_messages_author_posted_at"
    ON "thread_messages" ("author_id", "posted_at" DESC);

-- **The report index serves the item's threads.** FR-10's delete gate and
-- FR-11's withdrawal gate both ask "what threads exist on this report?",
-- and this index answers it directly.
CREATE INDEX "idx_thread_messages_report_id"
    ON "thread_messages" ("report_id");
