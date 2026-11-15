CREATE TABLE "reader_profiles" (
    "telegram_user_id" BIGINT NOT NULL PRIMARY KEY,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_at" DATETIME,
    "source_hash" TEXT,
    "source_review_ids" TEXT NOT NULL DEFAULT '[]',
    "latest_review_id" INTEGER,
    "model" TEXT NOT NULL DEFAULT 'gpt-6.1-terra',
    "reasoning_effort" TEXT NOT NULL DEFAULT 'high',
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "reader_profiles_status_next_attempt_at_idx" ON "reader_profiles"("status", "next_attempt_at");
