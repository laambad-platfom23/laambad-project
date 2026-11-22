-- A1 — e-mail verification + one-time codes (password reset / verify e-mail).
-- Additive only and idempotent: one nullable column, one new table, one backfill of the new column.
-- Applied with: node scripts/apply-app-sql.mjs prisma/app-sql/A1-email-verification.sql  (rehearsal-app only)

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS email_codes (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     varchar(32)  NOT NULL,            -- 'reset_password' | 'verify_email'
  code_hash   varchar(128) NOT NULL,            -- HMAC-SHA256(server secret, id:purpose:code); the code itself is never stored
  expires_at  timestamptz  NOT NULL,
  attempts    integer      NOT NULL DEFAULT 0,  -- wrong guesses; the code dies at 5
  consumed_at timestamptz  NULL,
  ip          varchar(255) NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_codes_user_purpose_created_idx ON email_codes (user_id, purpose, created_at DESC);

-- Existing accounts that are known to be real are marked verified:
--  * accounts created in the new app before this feature (team / test accounts),
--  * admins and instructors,
--  * migrated WordPress users who enrolled in a course or paid.
-- Every other migrated account is asked for an e-mail code the first time it is used.
UPDATE users u
   SET email_verified_at = now()
 WHERE u.email_verified_at IS NULL
   AND u.deleted_at IS NULL
   AND (
        u.legacy_wp_id IS NULL
     OR u.role_id IN (SELECT r.id FROM roles r WHERE r.slug IN ('admin', 'instructor'))
     OR EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id)
     OR EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.status = 'paid')
   );
