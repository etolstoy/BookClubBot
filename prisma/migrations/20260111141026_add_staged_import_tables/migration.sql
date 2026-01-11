-- CreateTable
CREATE TABLE "books" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "google_books_id" TEXT,
    "google_books_url" TEXT,
    "cover_url" TEXT,
    "genres" TEXT,
    "publication_year" INTEGER,
    "description" TEXT,
    "isbn" TEXT,
    "page_count" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "book_id" INTEGER,
    "telegram_user_id" BIGINT NOT NULL,
    "telegram_username" TEXT,
    "telegram_display_name" TEXT,
    "review_text" TEXT NOT NULL,
    "sentiment" TEXT,
    "message_id" BIGINT,
    "chat_id" BIGINT,
    "reviewed_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staged_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "message_id" BIGINT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "display_name" TEXT,
    "review_text" TEXT NOT NULL,
    "chat_id" BIGINT,
    "reviewed_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extraction_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "staged_messages_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "staged_extractions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staged_extractions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "confidence" TEXT NOT NULL,
    "titleVariants" TEXT,
    "authorVariants" TEXT,
    "alternativeBooks" TEXT,
    "additional_context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "confirmed_title" TEXT,
    "confirmed_author" TEXT,
    "enrichment_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "staged_extractions_enrichment_id_fkey" FOREIGN KEY ("enrichment_id") REFERENCES "staged_enrichments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staged_enrichments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "search_title" TEXT NOT NULL,
    "search_author" TEXT,
    "google_books_results" TEXT,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'needs_selection',
    "has_multiple_results" BOOLEAN NOT NULL DEFAULT false,
    "has_no_results" BOOLEAN NOT NULL DEFAULT false,
    "missing_cover" BOOLEAN NOT NULL DEFAULT false,
    "missing_metadata" BOOLEAN NOT NULL DEFAULT false,
    "selected_google_books_id" TEXT,
    "selected_book_data" TEXT,
    "entered_isbn" TEXT,
    "book_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "staged_enrichments_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "books_google_books_id_key" ON "books"("google_books_id");

-- CreateIndex
CREATE INDEX "reviews_telegram_user_id_reviewed_at_idx" ON "reviews"("telegram_user_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "reviews_book_id_idx" ON "reviews"("book_id");

-- CreateIndex
CREATE UNIQUE INDEX "staged_messages_extraction_id_key" ON "staged_messages"("extraction_id");

-- CreateIndex
CREATE INDEX "staged_messages_status_idx" ON "staged_messages"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staged_messages_telegram_user_id_message_id_key" ON "staged_messages"("telegram_user_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "staged_extractions_enrichment_id_key" ON "staged_extractions"("enrichment_id");

-- CreateIndex
CREATE INDEX "staged_extractions_status_idx" ON "staged_extractions"("status");

-- CreateIndex
CREATE INDEX "staged_enrichments_status_idx" ON "staged_enrichments"("status");
