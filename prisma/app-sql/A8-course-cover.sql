-- A8 — a real cover image field for courses made in this app (old-site courses keep their WordPress
-- featured image). Before, the cover was hidden inside the description text and could not be changed
-- in the Course Builder. Additive only and idempotent. Apply AFTER A7 and BEFORE deploying the code:
--   node scripts/apply-app-sql.mjs prisma/app-sql/A8-course-cover.sql [--dry-run]
ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_url varchar(1024) NULL;
