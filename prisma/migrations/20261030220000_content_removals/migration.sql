-- The content-removal table and the withheld markers — FR-36's write-side
-- invariants.
--
-- Implements `memory-bank/bolts/020-returns-moderation/` § Data Persistence.
--
-- Changes:
--   1. Create the `content_removals` table.
--   2. Add the **one-removal-per-target** unique constraint.
--   3. Add `reports.description_withheld` and `reports.image_withheld`.
--   4. Add `thread_messages.body_withheld`.
--
-- ── Why the content is marked rather than deleted ──────────────────────────
--
-- **The audit trail is append-only and has no correction path (ADR-6).** A
-- removal's audit record names the target and the reason. If the removal
-- physically deleted the content, that record would point at something that
-- no longer exists, and the trail would be describing a fact it could no
-- longer verify.
--
-- So the removal is a **row**, and the content is **marked withheld**. The
-- content still exists; it is simply no longer presented to members. The
-- marker's presence is the fact that the removal happened, and it is what
-- makes the removal idempotent — a second removal of an already-withheld
-- target matches no row in `content_removals`, and the unique constraint
-- says so at the data layer.
--
-- ── 1. The table ───────────────────────────────────────────────────────────
--
-- **The removal names its target by kind and id.** The three kinds are
-- closed — a report's image, a report's description, a thread message — and
-- the kind says which column or table the id refers to. An id alone would
-- be ambiguous across three surfaces.
--
-- **`removed_at` and `removed_by` are the record's own facts,** and the
-- reason is the administrator's own words, stored verbatim. The reason is
-- the only record of *why* an administrator withheld a member's content.
--
-- **`report_id` is CASCADE**, for the same PRD §10 reason as every other
-- report-owned table: a removal is retained for the parent report's
-- lifetime, and the FR-10 hard-delete path removes the report and
-- everything hanging from it.
--
-- **The administrator is RESTRICT.** Accounts are never deleted under FR-5
-- in any case, but stating the rule in the schema means the database
-- enforces it rather than a comment describing an intention.
CREATE TABLE "content_removals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    -- The report the removed content belongs to.
    "report_id" UUID NOT NULL,

    -- `report_image`, `report_description`, or `thread_message`.
    "target_kind" TEXT NOT NULL,

    -- The id of the row the content lives on.
    "target_id" UUID NOT NULL,

    -- The administrator's reason, verbatim. 10-500 characters.
    "removal_reason" TEXT NOT NULL,

    -- The administrator who removed the content.
    "removed_by" UUID NOT NULL,

    -- When the removal happened.
    "removed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_removals_pkey" PRIMARY KEY ("id"),

    -- The target kind is closed. The three kinds are the ones the domain's
    -- `CONTENT_REMOVAL_TARGET_KINDS` names, and a removal naming anything
    -- else would record a moderation act against nothing.
    CONSTRAINT "content_removals_target_kind_check"
        CHECK ("target_kind" IN ('report_image', 'report_description', 'thread_message')),

    -- The reason's bound, matching the domain's
    -- `REPORT_CLOSURE_REASON_MIN_LENGTH` / `..._MAX_LENGTH` exactly. The
    -- reason is administrator-supplied free text recorded on the trail, and
    -- it is the same kind of field as a closure reason.
    CONSTRAINT "content_removals_reason_length_check"
        CHECK (char_length("removal_reason") BETWEEN 10 AND 500),

    CONSTRAINT "content_removals_report_id_fkey"
        FOREIGN KEY ("report_id") REFERENCES "reports" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "content_removals_removed_by_fkey"
        FOREIGN KEY ("removed_by") REFERENCES "accounts" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── 2. One removal per target ─────────────────────────────────────────────
--
-- **The idempotence rule, at the data layer.** A second removal of the same
-- target violates this constraint, so the second write lands nothing — which
-- is the same fact the domain's `recordsNewRemoval` flag expresses.
--
-- The constraint is scoped to the kind *and* the id, so the same id under a
-- different kind is not a collision.
CREATE UNIQUE INDEX "uq_content_removals_target"
    ON "content_removals" ("target_kind", "target_id");

-- The administrator's own removals — the read an administrator's audit
-- view performs.
CREATE INDEX "idx_content_removals_report_id"
    ON "content_removals" ("report_id");

-- ── 3. The report's withheld markers ──────────────────────────────────────
--
-- **`description_withheld` and `image_withheld` are booleans, and the
-- columns they mark are NOT NULL.** The content stays on the row; only its
-- presentation changes. A `NULL` marker would mean "unknown", and the
-- marker is a fact — the content is withheld or it is not.
--
-- The image is a blob path, and the blob itself is not deleted: the audit
-- record names the target, and the target must remain verifiable. The
-- delivery path stops serving it, which is FR-36's "the content is no
-- longer presented to members".
ALTER TABLE "reports"
    ADD COLUMN "description_withheld" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN "image_withheld" BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 4. The thread message's withheld marker ───────────────────────────────
--
-- **Same rule as the report's markers.** The message's body stays; it is
-- simply no longer presented. The audit trail records what was removed and
-- why, and that record must remain verifiable.
ALTER TABLE "thread_messages"
    ADD COLUMN "body_withheld" BOOLEAN NOT NULL DEFAULT FALSE;
