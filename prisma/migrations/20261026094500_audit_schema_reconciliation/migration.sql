-- Audit and Observability — schema reconciliation.
--
-- Brings the Step 0 walking skeleton (`20261025052150_init_audit_skeleton`)
-- into line with `memory-bank/bolts/001-audit-core/ddd-02-technical-design.md`
-- and ADR-6 (append-only enforcement with a transaction-scoped FR-10 flag).
--
-- Changes:
--   1. Drop and recreate the audit tables so ids are UUIDs and timestamps are
--      `timestamptz` (the design's column list), rather than the scaffold's
--      cuid text ids and naive timestamps.
--   2. `audit_events.event_number` gains a CHECK constraint (NULL or 1–30), so
--      the database itself refuses an out-of-catalog number.
--   3. `audit_events` gains a `BEFORE UPDATE OR DELETE` trigger that refuses
--      every mutation. The one permitted deletion is the FR-10 hard delete,
--      which sets `findback.allow_audit_delete = 'on'` transaction-locally.
--   4. `audit_read_logs` and `quota_snapshots` get the same append-only
--      trigger with no permitted exception at all — a read log that can be
--      edited is not an access log.
--   5. `quota_snapshots` is created.

-- The scaffold tables are empty (verified: 0 rows), so dropping them is safe.

DROP TABLE IF EXISTS "AuditReadLog";
DROP TABLE IF EXISTS "AuditEvent";

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventNumber" INTEGER,
    "eventType" TEXT NOT NULL,
    "parentType" TEXT NOT NULL,
    "parentId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actingAdministratorId" UUID,
    "determinedByUserId" UUID,
    "recordedByAdministratorId" UUID,
    "reason" TEXT,
    "previousValues" JSONB,
    "changedFields" JSONB,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),

    -- The event number is either absent (a non-numbered FR-52/FR-53 record) or
    -- one of the thirty frozen catalog numbers. The database refuses event 31.
    CONSTRAINT "audit_events_event_number_range" CHECK (
        "eventNumber" IS NULL OR "eventNumber" BETWEEN 1 AND 30
    ),

    -- The actor role is a closed set. A `system` actor names the human who
    -- caused the action in `actingAdministratorId` or `metadata`.
    CONSTRAINT "audit_events_actor_role_check" CHECK (
        "actorRole" IN ('member', 'administrator', 'system')
    )
);

-- CreateTable
CREATE TABLE "AuditReadLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "administratorId" UUID NOT NULL,
    "query" TEXT,
    "filters" JSONB,
    "resultCount" INTEGER NOT NULL,
    "requestId" TEXT,
    "readAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource" TEXT NOT NULL,
    "usedAmount" BIGINT NOT NULL,
    "limitAmount" BIGINT NOT NULL,
    "observedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotaSnapshot_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "quota_snapshots_amounts_non_negative" CHECK (
        "usedAmount" >= 0 AND "limitAmount" >= 0
    )
);

-- CreateIndex
CREATE INDEX "idx_audit_events_parent_occurred" ON "AuditEvent"("parentId", "occurredAt" DESC, "id" DESC);
-- CreateIndex
CREATE INDEX "idx_audit_events_actor_occurred" ON "AuditEvent"("actorId", "occurredAt" DESC);
-- CreateIndex
CREATE INDEX "idx_audit_events_parent_type" ON "AuditEvent"("parentType", "parentId");
-- CreateIndex
CREATE INDEX "idx_audit_events_event_number" ON "AuditEvent"("eventNumber");
-- CreateIndex
CREATE INDEX "idx_audit_events_occurred" ON "AuditEvent"("occurredAt" DESC);
-- CreateIndex
CREATE INDEX "idx_audit_read_logs_admin_read_at" ON "AuditReadLog"("administratorId", "readAt" DESC);
-- CreateIndex
CREATE INDEX "idx_quota_snapshots_resource_observed" ON "QuotaSnapshot"("resource", "observedAt" DESC);

-- Append-only enforcement (ADR-6).
--
-- The application layer is already insert-only: `AuditEventRepository` exposes
-- no update, delete, or upsert, and `AuditWriter` is the only writer. This
-- trigger is the backstop that story `004-append-only-enforcement` requires —
-- it covers a direct `psql` write, a buggy script, and a migration, none of
-- which the application can prevent.
--
-- `SET LOCAL` is transaction-scoped, so the flag cannot outlive the
-- transaction that set it and cannot leak onto a reused pooled connection.

CREATE OR REPLACE FUNCTION findback_forbid_audit_mutation()
RETURNS trigger AS $$
BEGIN
    IF current_setting('findback.allow_audit_delete', true) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'audit table "%" is append-only (FR-31, story 004-append-only-enforcement)', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION findback_forbid_audit_mutation_strict()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'audit table "%" is append-only and permits no deletion (FR-31, story 004-append-only-enforcement)', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation();

CREATE TRIGGER "audit_read_logs_append_only"
BEFORE UPDATE OR DELETE ON "AuditReadLog"
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation_strict();

CREATE TRIGGER "quota_snapshots_append_only"
BEFORE UPDATE OR DELETE ON "QuotaSnapshot"
FOR EACH ROW EXECUTE FUNCTION findback_forbid_audit_mutation_strict();
