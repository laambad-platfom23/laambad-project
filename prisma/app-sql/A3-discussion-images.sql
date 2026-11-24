-- A3 — class discussion: messages can carry one image. Additive only and idempotent.
-- Applied with: node scripts/apply-app-sql.mjs prisma/app-sql/A3-discussion-images.sql [--dry-run]
-- Must be applied BEFORE deploying the code that reads course_discussion_messages.image_url.

ALTER TABLE course_discussion_messages ADD COLUMN IF NOT EXISTS image_url varchar(1024) NULL;
