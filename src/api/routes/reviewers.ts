import { Router } from "express";
import {
  getReviewsByUserId,
  getUserReviewStats,
} from "../../services/review.service.js";

const router = Router();

// GET /api/reviewers/:userId - Reviewer profile with their reviews
router.get("/:userId", async (req, res) => {
  try {
    const telegramUserId = BigInt(req.params.userId);
    const { limit = "50", offset = "0" } = req.query;

    const [reviews, stats] = await Promise.all([
      getReviewsByUserId(telegramUserId, {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      }),
      getUserReviewStats(telegramUserId),
    ]);

    if (reviews.length === 0 && stats.totalReviews === 0) {
      res.status(404).json({ error: "Reviewer not found" });
      return;
    }

    // Get reviewer info from the first review
    const firstReview = reviews[0];
    const reviewerInfo = firstReview
      ? {
          telegramUserId: firstReview.telegramUserId.toString(),
          username: firstReview.telegramUsername,
          displayName: firstReview.telegramDisplayName,
        }
      : {
          telegramUserId: req.params.userId,
          username: null,
          displayName: null,
        };

    res.json({
      reviewer: {
        ...reviewerInfo,
        totalReviews: stats.totalReviews,
        sentiments: stats.sentimentCounts,
      },
      reviews: reviews.map((review: {
        id: number;
        book: { id: number; title: string; author: string | null; coverUrl: string | null } | null;
        reviewText: string;
        sentiment: string | null;
        reviewedAt: Date;
        messageId: bigint | null;
        chatId: bigint | null;
      }) => ({
        id: review.id,
        book: review.book
          ? {
              id: review.book.id,
              title: review.book.title,
              author: review.book.author,
              coverUrl: review.book.coverUrl,
            }
          : null,
        reviewText: review.reviewText,
        sentiment: review.sentiment,
        reviewedAt: review.reviewedAt.toISOString(),
        messageId: review.messageId?.toString(),
        chatId: review.chatId?.toString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching reviewer:", error);
    res.status(500).json({ error: "Failed to fetch reviewer" });
  }
});

export default router;
