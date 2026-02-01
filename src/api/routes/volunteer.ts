import { Router } from "express";
import { authenticateTelegramWebApp } from "../middleware/telegram-auth.js";
import prisma from "../../lib/prisma.js";

const router = Router();

// GET /api/volunteer/stats - Get volunteer stats
router.get("/stats", authenticateTelegramWebApp, async (req, res) => {
  try {
    // Only return stats for chat members
    if (!req.telegramUser!.isChatMember) {
      return res.json({ booksNeedingHelp: 0, reviewsNeedingHelp: 0 });
    }

    const [booksCount, reviewsCount] = await Promise.all([
      prisma.book.count({
        where: {
          OR: [
            { coverUrl: null },
            { author: null },
            { goodreadsUrl: null },
          ],
        },
      }),
      prisma.review.count({ where: { bookId: null } }),
    ]);

    res.json({ booksNeedingHelp: booksCount, reviewsNeedingHelp: reviewsCount });
  } catch (error) {
    console.error("Error fetching volunteer stats:", error);
    res.status(500).json({ error: "Failed to fetch volunteer stats" });
  }
});

export default router;
