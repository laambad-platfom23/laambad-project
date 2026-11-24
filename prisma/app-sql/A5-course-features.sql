-- A5 — course approval, lesson sequencing, prerequisites, certificate templates, bundles, live sessions (Google Meet).
-- Additive only and idempotent. Apply BEFORE deploying the code that uses it:
--   node scripts/apply-app-sql.mjs prisma/app-sql/A5-course-features.sql [--dry-run]

-- ── Course approval (review queue) ──
ALTER TABLE courses ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL REFERENCES users(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS review_note text NULL;

-- ── Lesson sequencing: the next lesson opens when the previous one is completed ──
ALTER TABLE courses ADD COLUMN IF NOT EXISTS sequential_lessons boolean NOT NULL DEFAULT false;
-- the old site had "unlock sequentially" (Tutor content drip) on these 93 courses: keep it
UPDATE courses SET sequential_lessons = true
 WHERE sequential_lessons = false
   AND legacy_wp_id IN (1285,3481,4483,6060,6309,7225,8127,8902,9306,9313,9925,15103,15283,16073,16684,17800,18022,18072,18536,18742,19110,19145,19181,19214,19775,19873,20015,21528,21544,21689,22470,22830,22859,23269,23330,24136,24665,24986,25495,26358,26942,27086,27196,28184,28378,28771,29223,29429,29524,30491,31438,31441,31525,31771,31876,32081,33404,34235,34538,35355,35472,35573,37528,37563,37767,38832,39032,39281,39476,39969,41805,44237,44319,44412,44501,44588,44795,44928,45001,45287,45387,45870,46030,46316,46417,46459,46755,46981,47033,47545,47763,48299,48939);

-- ── Prerequisites: courses that must be completed before enrolling ──
CREATE TABLE IF NOT EXISTS course_prerequisites (
  course_id          uuid        NOT NULL REFERENCES courses(id),
  required_course_id uuid        NOT NULL REFERENCES courses(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, required_course_id),
  CHECK (course_id <> required_course_id)
);

-- ── Certificate builder ──
CREATE TABLE IF NOT EXISTS certificate_templates (
  id         uuid PRIMARY KEY,
  name       varchar(120) NOT NULL,
  design     jsonb        NOT NULL,          -- colours, texts, images, signatures, orientation
  is_default boolean      NOT NULL DEFAULT false,
  created_by uuid         NULL REFERENCES users(id),
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now(),
  deleted_at timestamptz  NULL
);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS certificate_template_id uuid NULL REFERENCES certificate_templates(id);

-- ── Course bundles (diplomas) ──
CREATE TABLE IF NOT EXISTS bundles (
  id          uuid PRIMARY KEY,
  title       varchar(255)  NOT NULL,
  slug        varchar(220)  NOT NULL UNIQUE,
  description text          NULL,
  cover_url   varchar(1024) NULL,
  price       decimal(16,2) NOT NULL DEFAULT 0,
  sale_price  decimal(16,2) NULL,
  currency    varchar(8)    NOT NULL DEFAULT 'USD',
  status      varchar(16)   NOT NULL DEFAULT 'draft',   -- draft | published
  legacy_wp_id bigint       NULL UNIQUE,
  created_by  uuid          NULL REFERENCES users(id),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  deleted_at  timestamptz   NULL
);
CREATE TABLE IF NOT EXISTS bundle_courses (
  bundle_id  uuid    NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  course_id  uuid    NOT NULL REFERENCES courses(id),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bundle_id, course_id)
);
CREATE TABLE IF NOT EXISTS bundle_orders (
  id              uuid PRIMARY KEY,
  bundle_id       uuid          NOT NULL REFERENCES bundles(id),
  user_id         uuid          NOT NULL REFERENCES users(id),
  amount          decimal(16,2) NOT NULL DEFAULT 0,
  currency        varchar(8)    NOT NULL DEFAULT 'USD',
  status          varchar(16)   NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  provider        varchar(16)   NOT NULL,                    -- free | wafi | offline
  provider_ref_id varchar(255)  NULL,
  transaction_id  varchar(255)  NULL,
  note            text          NULL,
  paid_at         timestamptz   NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bundle_orders_user_idx ON bundle_orders (user_id, bundle_id);
CREATE INDEX IF NOT EXISTS bundle_orders_status_idx ON bundle_orders (status, created_at DESC);

-- the two real diplomas from the old site (latest version of each), as DRAFTS for the admin to review
INSERT INTO bundles (id, title, slug, price, sale_price, currency, status, legacy_wp_id)
VALUES ('6a1f0b52-6f3e-4c55-9a52-2f0b7d1a4801', 'Diploma in Applied Research and Statistics', 'diploma-in-applied-research-and-statistics', 220, 110, 'USD', 'draft', 48480),
       ('6a1f0b52-6f3e-4c55-9a52-2f0b7d1a4802', 'Diploma in Computer Skills', 'diploma-in-computer-skills', 80, NULL, 'USD', 'draft', 24487)
ON CONFLICT (legacy_wp_id) DO NOTHING;
INSERT INTO bundle_courses (bundle_id, course_id, sort_order)
SELECT '6a1f0b52-6f3e-4c55-9a52-2f0b7d1a4801', c.id, x.ord
  FROM unnest(ARRAY[3481,15103,15283,19110,19145,19181,19214,1285,16073]::bigint[]) WITH ORDINALITY AS x(wp, ord)
  JOIN courses c ON c.legacy_wp_id = x.wp
ON CONFLICT DO NOTHING;
INSERT INTO bundle_courses (bundle_id, course_id, sort_order)
SELECT '6a1f0b52-6f3e-4c55-9a52-2f0b7d1a4802', c.id, x.ord
  FROM unnest(ARRAY[22830,22859,23022,23269,22470]::bigint[]) WITH ORDINALITY AS x(wp, ord)
  JOIN courses c ON c.legacy_wp_id = x.wp
ON CONFLICT DO NOTHING;

-- ── Live sessions (Google Meet) ──
CREATE TABLE IF NOT EXISTS live_sessions (
  id              uuid PRIMARY KEY,
  course_id       uuid          NOT NULL REFERENCES courses(id),
  instructor_id   uuid          NOT NULL REFERENCES users(id),
  title           varchar(255)  NOT NULL,
  description     text          NULL,
  starts_at       timestamptz   NOT NULL,
  duration_min    integer       NOT NULL DEFAULT 60,
  meet_url        varchar(512)  NULL,
  google_event_id varchar(255)  NULL,
  status          varchar(16)   NOT NULL DEFAULT 'scheduled',  -- scheduled | cancelled
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_sessions_course_start_idx ON live_sessions (course_id, starts_at);
-- an instructor's Google connection (refresh token stored encrypted, AES-256-GCM)
CREATE TABLE IF NOT EXISTS google_connections (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email      varchar(255) NULL,
  refresh_token_enc text         NOT NULL,
  scope             text         NULL,
  connected_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
