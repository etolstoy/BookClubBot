-- Drop staged tables (used only for historical import, no longer needed)
DROP TABLE IF EXISTS "staged_enrichments";
DROP TABLE IF EXISTS "staged_extractions";
DROP TABLE IF EXISTS "staged_messages";

-- Remove google_books_url from books (will be computed dynamically from google_books_id)
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
PRAGMA foreign_keys=off;

CREATE TABLE "books_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "google_books_id" TEXT,
    "cover_url" TEXT,
    "genres" TEXT,
    "publication_year" INTEGER,
    "description" TEXT,
    "isbn" TEXT,
    "page_count" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- Copy data from old table
INSERT INTO "books_new" (
    "id", "title", "author", "google_books_id", "cover_url", "genres",
    "publication_year", "description", "isbn", "page_count", "created_at", "updated_at"
)
SELECT
    "id", "title", "author", "google_books_id", "cover_url", "genres",
    "publication_year", "description", "isbn", "page_count", "created_at", "updated_at"
FROM "books";

-- Drop old table and rename new one
DROP TABLE "books";
ALTER TABLE "books_new" RENAME TO "books";

-- Recreate unique index on google_books_id
CREATE UNIQUE INDEX "books_google_books_id_key" ON "books"("google_books_id");

PRAGMA foreign_keys=on;
