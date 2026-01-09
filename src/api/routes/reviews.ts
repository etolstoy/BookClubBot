import { Router } from "express";
import { getRandomReviews, getRecentReviews } from "../../services/review.service.js";

const router = Router();

// GET /api/reviews/random - Get random reviews
router.get("/random", async (req, res) => {
  try {
    const { limit = "5" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const reviews = await getRandomReviews(parsedLimit);

    res.json({
      reviews: reviews.map((review: {
        id: number;
        telegramDisplayName: string | null;
        telegramUsername: string | null;
        telegramUserId: bigint;
        reviewText: string;
        sentiment: string | null;
        reviewedAt: Date;
        messageId: bigint | null;
        chatId: bigint | null;
        book: {
          id: number;
          title: string;
          author: string | null;
          coverUrl: string | null;
        } | null;
      }) => ({
        id: review.id,
        reviewerName: review.telegramDisplayName || review.telegramUsername || "Anonymous",
        reviewerUsername: review.telegramUsername,
        telegramUserId: review.telegramUserId.toString(),
        reviewText: review.reviewText,
        sentiment: review.sentiment,
        reviewedAt: review.reviewedAt.toISOString(),
        messageId: review.messageId?.toString(),
        chatId: review.chatId?.toString(),
        book: review.book ? {
          id: review.book.id,
          title: review.book.title,
          author: review.book.author,
          coverUrl: review.book.coverUrl,
        } : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching random reviews:", error);
    res.status(500).json({ error: "Failed to fetch random reviews" });
  }
});

// GET /api/reviews/recent - Get recent reviews with pagination
router.get("/recent", async (req, res) => {
  try {
    const { limit = "20", offset = "0" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid limit or offset parameter" });
      return;
    }

    const reviews = await getRecentReviews(parsedLimit, parsedOffset);

    res.json({
      reviews: reviews.map((review: {
        id: number;
        telegramDisplayName: string | null;
        telegramUsername: string | null;
        telegramUserId: bigint;
        reviewText: string;
        sentiment: string | null;
        reviewedAt: Date;
        messageId: bigint | null;
        chatId: bigint | null;
        book: {
          id: number;
          title: string;
          author: string | null;
          coverUrl: string | null;
        } | null;
      }) => ({
        id: review.id,
        reviewerName: review.telegramDisplayName || review.telegramUsername || "Anonymous",
        reviewerUsername: review.telegramUsername,
        telegramUserId: review.telegramUserId.toString(),
        reviewText: review.reviewText,
        sentiment: review.sentiment,
        reviewedAt: review.reviewedAt.toISOString(),
        messageId: review.messageId?.toString(),
        chatId: review.chatId?.toString(),
        book: review.book ? {
          id: review.book.id,
          title: review.book.title,
          author: review.book.author,
          coverUrl: review.book.coverUrl,
        } : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching recent reviews:", error);
    res.status(500).json({ error: "Failed to fetch recent reviews" });
  }
});

export default router;
