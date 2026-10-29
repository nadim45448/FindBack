-- Reporting and Listings — the `reports` table, the `campus_areas` table,
-- and the naming-convention renames.
--
-- Implements `memory-bank/bolts/007-reporting-core/ddd-02-technical-design.md`
-- § Data Persistence, under ADR-20 (the campus-area configuration mechanism)
-- and `coding-standards.md` § Naming conventions (tables snake_case plural).
--
-- Changes, in order:
--   1. Rename the pre-existing tables to their conventional physical names.
--   2. Recreate the ADR-6 append-only trigger against `audit_events` — the
--      trigger follows the rename, and the migration asserts it survived.
--   3. Create `reports` with its CHECK constraints and indexes.
--   4. Create `campus_areas`.
--   5. Create the GIN keyword-search index.
--   6. Seed `campus_areas` — **empty**.
--
-- The renames touch tables this bolt does not otherwise own. That is the
-- point: bolt `006`'s readers already issue raw `SELECT`s against
-- `audit_events` and `accounts`, so the physical names had to become the
-- conventional ones before those readers could be integration-tested.

-- ── 1. The renames ────────────────────────────────────────────────────────
--
-- `ALTER TABLE … RENAME TO` keeps the table's data, its constraints, its
-- indexes, and its triggers. Only the name changes.
--
-- The foreign keys that point at the renamed tables follow automatically:
-- PostgreSQL resolves a foreign key to the table's OID, not to its name, so
-- `Session_accountId_fkey` still references the renamed `accounts` row.

ALTER TABLE "AuditEvent" RENAME TO "audit_events";
ALTER TABLE "AuditReadLog" RENAME TO "audit_read_logs";
ALTER TABLE "QuotaSnapshot" RENAME TO "quota_snapshots";
ALTER TABLE "Account" RENAME TO "accounts";
ALTER TABLE "Session" RENAME TO "sessions";
ALTER TABLE "PasswordResetToken" RENAME TO "password_reset_tokens";
ALTER TABLE "RateLimitCounter" RENAME TO "rate_limit_counters";

-- The constraint names on the renamed tables are still the Prisma-style
-- ones (`"AuditEvent_pkey"`, `"Session_accountId_fkey"`). Prisma expects
-- those names, so they are deliberately left alone — renaming a constraint
-- would break `prisma migrate diff` against a freshly generated schema.

-- ── 2. The append-only trigger follows the rename ────────────────────────
--
-- A trigger is attached to a table, so `ALTER TABLE … RENAME` carries it
-- across: the trigger's `tgrelid` is the table's OID, which the rename does
-- not change. PostgreSQL rewrites the trigger's recorded table name.
--
-- The trigger is **recreated** rather than assumed, because the design makes
-- the survival a checked fact rather than a relied-upon behaviour. Dropping
-- and recreating it is idempotent and leaves the same function in place.

DROP TRIGGER IF EXISTS "audit_events_append_only" ON "audit_events";

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation();

DROP TRIGGER IF EXISTS "audit_read_logs_append_only" ON "audit_read_logs";

CREATE TRIGGER "audit_read_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_read_logs"
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation_strict();

DROP TRIGGER IF EXISTS "quota_snapshots_append_only" ON "quota_snapshots";

CREATE TRIGGER "quota_snapshots_append_only"
BEFORE UPDATE OR DELETE ON "quota_snapshots"
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation_strict();

-- ── 3. The `reports` table ────────────────────────────────────────────────
--
-- The FR-8 field set is closed. Every column below is a field the PRD names.
--
-- **`date` is `DATE`, not `TIMESTAMPTZ`.** The domain compares by calendar
-- day (FR-6's 365-day bound, FR-7's 30-day bound). A timestamp would make
-- "exactly 365 days ago" depend on the time of day.
--
-- **`campus_area` carries NO foreign key** (ADR-20). The membership rule is
-- a *validation* rule, not a referential one: a deactivated area must not
-- rewrite existing reports, and a foreign key cannot express that.
--
-- **`exact_place`, `identifying_details`, `image_ref` are FR-37 Sensitive
-- Fields.** They are stored here and read only through a governed path.

CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "campus_area" TEXT NOT NULL,
    "exact_place" TEXT,
    "identifying_details" TEXT,
    "image_ref" TEXT,
    "reporter_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id"),

    -- The two report types. Set at creation and never changed.
    CONSTRAINT "reports_type_check" CHECK (
        "type" IN ('Lost', 'Found')
    ),

    -- The six PRD lifecycle statuses.
    CONSTRAINT "reports_status_check" CHECK (
        "status" IN ('Open', 'Claim Requested', 'Claim Approved',
                     'Verification Pending', 'Returned', 'Closed')
    ),

    -- The nine PRD categories, verbatim.
    CONSTRAINT "reports_category_check" CHECK (
        "category" IN ('Wallet', 'Bag', 'Electronics', 'Keys', 'Clothing',
                       'Books/Notebooks', 'Identification', 'Water Bottle', 'Other')
    ),

    -- The length rules. `char_length` counts characters, not bytes, which
    -- matches the domain's rule and differs from PostgreSQL's `length` for
    -- multi-byte text. The validator is the enforcement point and produces a
    -- field-level error; these are the invariants that hold even if a path
    -- bypasses it.
    CONSTRAINT "reports_name_length_check" CHECK (
        char_length("name") BETWEEN 1 AND 80
    ),
    CONSTRAINT "reports_description_length_check" CHECK (
        char_length("description") BETWEEN 10 AND 2000
    ),
    CONSTRAINT "reports_exact_place_length_check" CHECK (
        "exact_place" IS NULL OR char_length("exact_place") <= 200
    ),
    CONSTRAINT "reports_identifying_details_length_check" CHECK (
        "identifying_details" IS NULL OR char_length("identifying_details") <= 500
    ),

    -- A report cannot be dated in the future. The validator enforces this
    -- with an injected clock; the constraint is the second line of defence.
    -- `CURRENT_DATE` is the *database session's* time zone, which is why the
    -- database's time zone must be UTC — see the note at the end of this
    -- migration.
    CONSTRAINT "reports_date_not_future_check" CHECK (
        "date" <= CURRENT_DATE
    )
);

-- Accounts are never deleted (FR-5, PRD §10), so the constraint never fires.
-- Stating it means the rule is in the schema rather than in a comment, and a
-- future path that tried to delete an account would be refused by the
-- database rather than orphaning its reports.
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "accounts" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The FR-14 filter indexes. Bolt `009` consumes them; a table created
-- without its indexes and a later bolt adding them is a migration for no
-- reason.
CREATE INDEX "idx_reports_status_created" ON "reports" ("status", "created_at" DESC);
CREATE INDEX "idx_reports_type_status_created" ON "reports" ("type", "status", "created_at" DESC);
CREATE INDEX "idx_reports_category_created" ON "reports" ("category", "created_at" DESC);
CREATE INDEX "idx_reports_campus_area_created" ON "reports" ("campus_area", "created_at" DESC);
CREATE INDEX "idx_reports_date" ON "reports" ("date" DESC);
CREATE INDEX "idx_reports_reporter_created" ON "reports" ("reporter_id", "created_at" DESC);

-- ── 4. The `campus_areas` table ───────────────────────────────────────────
--
-- ADR-20. The lookup table the validator reads, and the list a deployment
-- seeds per deployment.
--
-- `value` is the primary key because it is what a report stores; `label` is
-- the display name, and the two are separate so a rename does not rewrite a
-- single report.

CREATE TABLE "campus_areas" (
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campus_areas_pkey" PRIMARY KEY ("value")
);

CREATE INDEX "idx_campus_areas_active" ON "campus_areas" ("active");

-- The seed is **empty by default**. Which areas exist is the deployment's
-- decision — the PRD names no campus areas, and a migration that invented
-- them would be authoring content the PRD does not have. The example
-- deployment seeds a small set; see `prisma/seed.ts`.

-- ── 5. The keyword-search index ───────────────────────────────────────────
--
-- A GIN index over a generated `tsvector`, using the `'simple'` configuration
-- rather than `'english'`. `'simple'` does not stem and does not drop stop
-- words, which is what a name-and-description search wants: an item called
-- "Keys" must be findable by searching "keys", and a description mentioning
-- "the" must not silently vanish from the index.
--
-- **`name || ' ' || description` deliberately excludes the Sensitive
-- Fields.** `exact_place` and `identifying_details` are **not** in the
-- search index. A search index over a Sensitive Field is a **disclosure
-- surface**: it would let an unauthorised member infer that a word appears
-- in a field they may not read.

CREATE INDEX "idx_reports_search" ON "reports"
    USING GIN (to_tsvector('simple', "name" || ' ' || "description"));

-- ── The database's time zone ──────────────────────────────────────────────
--
-- The validator compares against an injected clock's calendar day in **UTC**,
-- and `CURRENT_DATE` above is the **database session's** time zone. If the
-- database session ran in a time zone ahead of UTC, a report dated "today" in
-- UTC could be rejected as "tomorrow" by the constraint.
--
-- The database's default time zone is set to UTC here. A **deployment** whose
-- database region reports a non-UTC time zone must set it — that is a
-- one-time deploy step, recorded in the design so it is not discovered as a
-- bug.
--
-- `ALTER DATABASE` cannot run inside a transaction block, so this is
-- deliberately left to the deployment rather than attempted here.
--
-- SET TIME ZONE 'UTC';
