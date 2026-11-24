-- A2 — student features: WhatsApp consent, streak, course retake, group discussion, learning paths,
-- passkeys, books. Additive only and idempotent: nullable columns / columns with defaults and new tables.
-- No existing row or column is changed, so the running app (older Prisma client) keeps working.
-- Applied with: node scripts/apply-app-sql.mjs prisma/app-sql/A2-student-features.sql [--dry-run]

-- ── WhatsApp (consent-based; messages are opened by staff via wa.me links) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone varchar(30) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz NULL;

-- ── Course retake (progress is reset with UPDATE, never removed; the certificate stays) ──
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS retake_count integer NOT NULL DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS last_retake_at timestamptz NULL;

-- ── Streak: one row per user per learning day (Africa/Mogadishu calendar day) ──
CREATE TABLE IF NOT EXISTS learning_days (
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            date        NOT NULL,
  activity_count integer     NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

-- ── Group discussion: one room per course, for its enrolled students + staff ──
CREATE TABLE IF NOT EXISTS course_discussion_messages (
  id         uuid PRIMARY KEY,
  course_id  uuid        NOT NULL REFERENCES courses(id),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  uuid        NULL REFERENCES course_discussion_messages(id),
  body       text        NOT NULL,
  is_pinned  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS course_discussion_course_created_idx ON course_discussion_messages (course_id, created_at DESC);

-- ── Learning paths: an ordered list of courses ──
CREATE TABLE IF NOT EXISTS learning_paths (
  id          uuid PRIMARY KEY,
  title       varchar(255)  NOT NULL,
  slug        varchar(220)  NOT NULL UNIQUE,
  description text          NULL,
  cover_url   varchar(1024) NULL,
  level       varchar(32)   NULL,
  status      varchar(16)   NOT NULL DEFAULT 'draft',   -- draft | published
  sort_order  integer       NOT NULL DEFAULT 0,
  created_by  uuid          NULL REFERENCES users(id),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  deleted_at  timestamptz   NULL
);
CREATE TABLE IF NOT EXISTS learning_path_courses (
  path_id    uuid    NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id  uuid    NOT NULL REFERENCES courses(id),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (path_id, course_id)
);

-- ── Passkeys (WebAuthn) ──
CREATE TABLE IF NOT EXISTS user_passkeys (
  id            uuid PRIMARY KEY,
  user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id varchar(512) NOT NULL UNIQUE,              -- base64url
  public_key    bytea        NOT NULL,
  counter       bigint       NOT NULL DEFAULT 0,
  transports    varchar(255) NULL,
  device_type   varchar(32)  NULL,
  backed_up     boolean      NOT NULL DEFAULT false,
  name          varchar(100) NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  last_used_at  timestamptz  NULL
);
CREATE INDEX IF NOT EXISTS user_passkeys_user_idx ON user_passkeys (user_id);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          uuid PRIMARY KEY,
  user_id     uuid         NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     varchar(16)  NOT NULL,                       -- 'register' | 'login'
  challenge   varchar(255) NOT NULL,
  expires_at  timestamptz  NOT NULL,
  consumed_at timestamptz  NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- ── Books (free or paid PDF). The file location is never sent to the browser. ──
CREATE TABLE IF NOT EXISTS books (
  id          uuid PRIMARY KEY,
  title       varchar(255)  NOT NULL,
  slug        varchar(220)  NOT NULL UNIQUE,
  author      varchar(255)  NULL,
  description text          NULL,
  cover_url   varchar(1024) NULL,
  file_url    varchar(1024) NULL,
  file_name   varchar(255)  NULL,
  file_size   bigint        NULL,
  is_free     boolean       NOT NULL DEFAULT true,
  price       decimal(16,2) NOT NULL DEFAULT 0,
  currency    varchar(8)    NOT NULL DEFAULT 'USD',
  status      varchar(16)   NOT NULL DEFAULT 'draft',     -- draft | published
  created_by  uuid          NULL REFERENCES users(id),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  deleted_at  timestamptz   NULL
);
CREATE TABLE IF NOT EXISTS book_orders (
  id              uuid PRIMARY KEY,
  book_id         uuid          NOT NULL REFERENCES books(id),
  user_id         uuid          NOT NULL REFERENCES users(id),
  amount          decimal(16,2) NOT NULL DEFAULT 0,
  currency        varchar(8)    NOT NULL DEFAULT 'USD',
  status          varchar(16)   NOT NULL DEFAULT 'pending', -- pending | paid | failed
  provider        varchar(16)   NOT NULL,                   -- free | wafi | offline
  provider_ref_id varchar(255)  NULL,                       -- payer wallet number
  transaction_id  varchar(255)  NULL,
  note            text          NULL,
  paid_at         timestamptz   NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS book_orders_user_book_idx ON book_orders (user_id, book_id);
CREATE INDEX IF NOT EXISTS book_orders_status_idx ON book_orders (status, created_at DESC);
