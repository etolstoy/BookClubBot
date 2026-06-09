import { Router } from "express";
import type { Telegraf } from "telegraf";
import { activateSubscription } from "../../services/subscription.service.js";
import { authenticateTelegramWebApp } from "../middleware/telegram-auth.js";

const PRIVATE_CHAT_REQUIRED_CODE = "BOT_PRIVATE_CHAT_REQUIRED";

function isPrivateChatUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("403") ||
    message.includes("400") ||
    message.includes("blocked") ||
    message.includes("bot was blocked") ||
    message.includes("chat not found") ||
    message.includes("user is deactivated") ||
    message.includes("forbidden")
  );
}

export function createSubscriptionsRouter(bot: Telegraf) {
  const router = Router();

  router.post("/activate", authenticateTelegramWebApp, async (req, res) => {
    try {
      const telegramUserId = req.telegramUser?.id;

      if (!telegramUserId) {
        res.status(401).json({ error: "Missing Telegram user" });
        return;
      }

      try {
        await bot.telegram.sendChatAction(telegramUserId.toString(), "typing");
      } catch (error) {
        if (isPrivateChatUnavailableError(error)) {
          res.status(409).json({
            error: "Bot private chat required",
            code: PRIVATE_CHAT_REQUIRED_CODE,
          });
          return;
        }

        throw error;
      }

      const subscription = await activateSubscription(telegramUserId);

      res.json(subscription);
    } catch (error) {
      console.error("Error activating subscription:", error);
      res.status(500).json({ error: "Failed to activate subscription" });
    }
  });

  return router;
}

