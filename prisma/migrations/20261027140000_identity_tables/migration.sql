-- Identity and Access — accounts, sessions, reset tokens, rate-limit counters.
--
-- Implements `memory-bank/bolts/004-identity-core/ddd-02-technical-design.md`
-- § Data Persistence, under ADR-12 (Argon2id via Node's built-in crypto),
-- ADR-13 (the module is `accounts/`), ADR-15 (a database-backed rate
-- limiter), and ADR-16 (the hourly session-activity refresh).
--
-- This migration does NOT touch the audit tables — the audit schema is bolt
-- 001's, already migrated, and changing it here would be a cross-bolt edit.
-- The one audit-side change (the third non-numbered record type) is a code
-- change in the catalog, not a schema change.
--
-- Creates:
--   1. `accounts`          — the registered account. Never deleted (FR-5).
--   2. `sessions`          — a revocable server-side session (PRD A2).
--   3. `password_reset_tokens` — the FR-51 seam, written by bolt 005.
--   4. `rate_limit_counters`   — the shared rate-limit store (ADR-15).

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "selfDeclaredRole" TEXT NOT NULL,
    "selfDeclaredRoleOther" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "isAdministrator" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMPTZ(6),
    "deactivatedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),

    -- The four PRD lifecycle states, verbatim. A text column with a CHECK
    -- rather than a database enum, so a new status is not a migration.
    CONSTRAINT "accounts_status_check" CHECK (
        "status" IN ('Pending', 'Active', 'Rejected', 'Deactivated')
    ),

    -- The four PRD self-declared roles, verbatim.
    CONSTRAINT "accounts_self_declared_role_check" CHECK (
        "selfDeclaredRole" IN ('Student', 'Employee', 'Visitor', 'Other')
    ),

    -- The `Other` role is the only one that carries free text, and it carries
    -- it here and nowhere else. The other three must not.
    CONSTRAINT "accounts_role_other_check" CHECK (
        ("selfDeclaredRole" = 'Other' AND "selfDeclaredRoleOther" IS NOT NULL)
        OR ("selfDeclaredRole" <> 'Other' AND "selfDeclaredRoleOther" IS NULL)
    ),

    -- A rejection reason is set only by a rejection, and an account that was
    -- never rejected has none. The reason is stored for audit and is never
    -- returned to the member.
    CONSTRAINT "accounts_rejection_reason_check" CHECK (
        ("status" = 'Rejected') OR ("rejectionReason" IS NULL)
    ),

    -- An administrator flag on a non-Active account grants nothing (story
    -- 006's edge case), so the flag is only meaningful on an Active account.
    CONSTRAINT "accounts_administrator_active_check" CHECK (
        "isAdministrator" = false OR "status" = 'Active'
    )
);

-- The functional unique index. `lower(btrim(email))` rather than the stored
-- value, so a row written by any path — including one that skipped the
-- application's normalization — is deduplicated the same way. This is the
-- database's final arbiter against a concurrent-registration race, which an
-- application-level `existsByEmail` check cannot be.
CREATE UNIQUE INDEX "idx_accounts_email_unique" ON "Account" (lower(btrim("email")));

-- The pending-registration queue is an index range scan over the Pending
-- rows, ordered by submission time (FR-3).
CREATE INDEX "idx_accounts_status_created" ON "Account" ("status", "createdAt");

CREATE INDEX "idx_accounts_administrator" ON "Account" ("isAdministrator");

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "revocationReason" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),

    -- A session cannot expire before it was created.
    CONSTRAINT "sessions_expiry_after_creation_check" CHECK (
        "expiresAt" > "createdAt"
    ),

    -- A session is either revoked or it is not; the reason is present only
    -- when it is. Revocation is terminal and idempotent.
    CONSTRAINT "sessions_revocation_check" CHECK (
        ("revokedAt" IS NULL AND "revocationReason" IS NULL)
        OR ("revokedAt" IS NOT NULL)
    )
);

-- The token is looked up by its hash on every authenticated request.
CREATE UNIQUE INDEX "idx_sessions_token_hash" ON "Session" ("tokenHash");

CREATE INDEX "idx_sessions_account" ON "Session" ("accountId");

-- The daily sweep deletes expired sessions by this index. It is a storage
-- cleanup only — expiry itself is enforced on read (ADR-16).
CREATE INDEX "idx_sessions_expires_at" ON "Session" ("expiresAt");

-- Accounts are never deleted, and a session without an account is meaningless.
-- `ON DELETE RESTRICT` states the real rule rather than implementing a
-- cascade that never fires.
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
--
-- The FR-51 seam. Written by bolt `005-identity-security`; bolt `004` adds
-- the table so the schema is coherent and the table stays empty.
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),

    -- A token expires after it was created.
    CONSTRAINT "password_reset_tokens_expiry_check" CHECK (
        "expiresAt" > "createdAt"
    )
);

CREATE UNIQUE INDEX "idx_password_reset_tokens_token_hash" ON "PasswordResetToken" ("tokenHash");

CREATE INDEX "idx_password_reset_tokens_account" ON "PasswordResetToken" ("accountId");

CREATE INDEX "idx_password_reset_tokens_expires_at" ON "PasswordResetToken" ("expiresAt");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
--
-- The shared rate-limit store (ADR-15). A counter is a fact about a key, not
-- about an account, so it has no foreign key and no cascade: a counter must
-- outlive any particular account.
CREATE TABLE "RateLimitCounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("id"),

    -- A count is never negative. The increment and the decision are one
    -- statement, so the count cannot be lost — but the constraint states the
    -- invariant independently of the code that maintains it.
    CONSTRAINT "rate_limit_counters_count_check" CHECK ("count" >= 0)
);

-- This unique constraint is what makes the increment atomic. `INSERT … ON
-- CONFLICT DO UPDATE` is a single statement, so two concurrent requests for
-- the same bucket cannot both read the same count and both be allowed.
CREATE UNIQUE INDEX "idx_rate_limit_counters_bucket_window"
    ON "RateLimitCounter" ("bucketKey", "windowStart");

-- The daily sweep deletes counters older than a day.
CREATE INDEX "idx_rate_limit_counters_window_start" ON "RateLimitCounter" ("windowStart");
