-- A12 (Phase 2 test, batch 1b): books are read in the app (pdf.js, not downloaded), with the page
-- count, a related course ("Practise what this book teaches"), reading progress + bookmarks, and reviews.
-- Additive and re-runnable (IF NOT EXISTS).

ALTER TABLE books ADD COLUMN IF NOT EXISTS page_count integer NULL;

ALTER TABLE books ADD COLUMN IF NOT EXISTS course_id uuid NULL REFERENCES courses(id);

CREATE TABLE IF NOT EXISTS book_progress (
  user_id     uuid        NOT NULL REFERENCES users(id),
  book_id     uuid        NOT NULL REFERENCES books(id),
  last_page   integer     NOT NULL DEFAULT 1,
  page_count  integer     NULL,
  bookmarks   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS book_reviews (
  id          uuid        PRIMARY KEY,
  book_id     uuid        NOT NULL REFERENCES books(id),
  user_id     uuid        NOT NULL REFERENCES users(id),
  rating      smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS book_reviews_one_per_user ON book_reviews (book_id, user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS book_reviews_book_idx ON book_reviews (book_id, created_at DESC) WHERE deleted_at IS NULL;
