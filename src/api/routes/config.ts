import { Router } from "express";
import { config } from "../../lib/config.js";
import { optionalTelegramAuth } from "../middleware/telegram-auth.js";

const router = Router();

// GET /api/config - Get public configuration
router.get("/", optionalTelegramAuth, async (req, res) => {
  try {
    res.json({
      adminUserIds: config.adminUserIds.map(id => id.toString()),
      botUsername: config.botUsername,
      isChatMember: req.telegramUser?.isChatMember,
    });
  } catch (error) {
    console.error("Error fetching config:", error);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

export default router;
