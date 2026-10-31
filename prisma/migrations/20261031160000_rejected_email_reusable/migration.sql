-- A rejected registration no longer occupies the email address.
--
-- Accounts are never deleted (FR-5). The rejected row stays for the audit
-- trail. The unique index is therefore partial: only live statuses
-- (`Pending`, `Active`, `Deactivated`) compete for an email, so a member
-- whose registration was rejected can register again with the same address.
--
-- `ON CONFLICT (lower(btrim("email")))` writers must name the same
-- predicate: `WHERE "status" <> 'Rejected'`.

DROP INDEX IF EXISTS "idx_accounts_email_unique";

CREATE UNIQUE INDEX "idx_accounts_email_unique"
    ON "accounts" (lower(btrim("email")))
    WHERE "status" <> 'Rejected';
