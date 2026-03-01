import { Router } from "express";
import { config } from "../../lib/config.js";
import { generateMonthlyDigest } from "../../services/digest.service.js";

const router = Router();

/**
 * POST /api/digest/trigger
 * Triggers monthly digest generation and sends it to the target chat.
 * Authenticated via Bearer token (DIGEST_CRON_SECRET).
 */
router.post("/trigger", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (
    !config.digestCronSecret ||
    !authHeader ||
    authHeader !== `Bearer ${config.digestCronSecret}`
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!config.targetChatId) {
    res.status(500).json({ error: "TARGET_CHAT_ID not configured" });
    return;
  }

  try {
    const digest = await generateMonthlyDigest();

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.targetChatId.toString(),
          text: digest,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
      }
    );

    if (!telegramResponse.ok) {
      const errorBody = await telegramResponse.text();
      console.error("[Digest] Telegram API error:", errorBody);
      res
        .status(502)
        .json({ error: "Failed to send digest to Telegram", details: errorBody });
      return;
    }

    res.json({ status: "ok", message: "Digest sent successfully" });
  } catch (error) {
    console.error("[Digest] Error triggering digest:", error);
    res.status(500).json({ error: "Failed to generate or send digest" });
  }
});

export default router;
