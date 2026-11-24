-- A4 — e-mail integration: one log row per sent event (no duplicates) + reminder opt-out.
-- Additive only and idempotent. Apply BEFORE deploying the code that uses it:
--   node scripts/apply-app-sql.mjs prisma/app-sql/A4-email-notifications.sql [--dry-run]

-- the student can turn learning reminder e-mails off (null = on). Account e-mails (codes, receipts) are always sent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_reminders_off_at timestamptz NULL;

-- every event e-mail is logged once per (user, kind, ref): a retry or a second trigger never sends it twice
CREATE TABLE IF NOT EXISTS email_log (
  id         uuid PRIMARY KEY,
  user_id    uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       varchar(40)  NOT NULL,          -- enrolled | payment_rejected | certificate | book | reminder
  ref_key    varchar(120) NOT NULL,          -- e.g. course id, payment id, ISO week
  ok         boolean      NOT NULL DEFAULT false,
  created_at timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_log_user_kind_ref_uq ON email_log (user_id, kind, ref_key);
CREATE INDEX IF NOT EXISTS email_log_kind_created_idx ON email_log (kind, created_at DESC);
