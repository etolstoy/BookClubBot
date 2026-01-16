-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_reviews" (
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
    CONSTRAINT "reviews_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_reviews" ("book_id", "chat_id", "created_at", "id", "message_id", "review_text", "reviewed_at", "sentiment", "telegram_display_name", "telegram_user_id", "telegram_username") SELECT "book_id", "chat_id", "created_at", "id", "message_id", "review_text", "reviewed_at", "sentiment", "telegram_display_name", "telegram_user_id", "telegram_username" FROM "reviews";
DROP TABLE "reviews";
ALTER TABLE "new_reviews" RENAME TO "reviews";
CREATE INDEX "reviews_telegram_user_id_reviewed_at_idx" ON "reviews"("telegram_user_id", "reviewed_at");
CREATE INDEX "reviews_book_id_idx" ON "reviews"("book_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
