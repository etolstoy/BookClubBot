import { Router } from "express";
import {
  getReviewsByUserId,
  getUserReviewStats,
} from "../../services/review.service.js";
import { getReaderProfile } from "../../services/reader-profile.service.js";

const router = Router();

// Reading a profile never starts an AI request.
router.get("/:userId/reader-profile", async (req, res) => {
  if (!/^\d+$/.test(req.params.userId)) {
    res.status(400).json({ error: "Invalid reviewer ID" });
    return;
  }
  try {
    res.json({ readerProfile: await getReaderProfile(BigInt(req.params.userId)) });
  } catch {
    res.status(500).json({ error: "Failed to fetch reader profile" });
  }
});

// GET /api/reviewers/:userId - Reviewer profile with their reviews
router.get("/:userId", async (req, res) => {
  try {
    const telegramUserId = BigInt(req.params.userId);
    const { limit = "50", offset = "0" } = req.query;

    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid limit or offset parameter" });
      return;
    }

    const [reviews, stats, readerProfile] = await Promise.all([
      getReviewsByUserId(telegramUserId, {
        limit: parsedLimit,
        offset: parsedOffset,
      }),
      getUserReviewStats(telegramUserId),
      getReaderProfile(telegramUserId),
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
        readerProfile,
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
