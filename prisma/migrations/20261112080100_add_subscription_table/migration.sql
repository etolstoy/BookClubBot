-- The Subscription model previously had no migration. Preserve databases where
-- it was already created with db push while making migrate deploy complete.
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegram_user_id" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_telegram_user_id_key"
    ON "subscriptions"("telegram_user_id");
