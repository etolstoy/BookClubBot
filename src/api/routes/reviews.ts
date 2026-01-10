import { Router } from "express";
import {
  getRandomReviews,
  getRecentReviews,
  updateReview,
  isReviewOwner,
  getReviewById,
  cleanupOrphanBooks,
} from "../../services/review.service.js";
import { authenticateTelegramWebApp } from "../middleware/telegram-auth.js";
import { sendInfoNotification } from "../../services/notification.service.js";
import { analyzeSentiment } from "../../services/sentiment.js";

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

// PATCH /api/reviews/:id - Update a review
router.patch("/:id", authenticateTelegramWebApp, async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id, 10);
    const { reviewText, sentiment, bookId } = req.body;

    if (isNaN(reviewId)) {
      res.status(400).json({ error: "Invalid review ID" });
      return;
    }

    // Check if review exists
    const existingReview = await getReviewById(reviewId);
    if (!existingReview) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    // Check ownership
    const isOwner = await isReviewOwner(reviewId, req.telegramUser!.id);
    if (!isOwner) {
      res.status(403).json({ error: "You can only edit your own reviews" });
      return;
    }

    // Validate sentiment if provided
    if (sentiment && !["positive", "negative", "neutral"].includes(sentiment)) {
      res.status(400).json({ error: "Invalid sentiment value" });
      return;
    }

    // Validate review text if provided
    if (reviewText !== undefined && reviewText.trim().length === 0) {
      res.status(400).json({ error: "Review text cannot be empty" });
      return;
    }

    // Track old book ID for orphan cleanup
    const oldBookId = existingReview.bookId;

    // Build update object
    const updateData: any = {};

    if (reviewText !== undefined) {
      updateData.reviewText = reviewText.trim();

      // Re-analyze sentiment if text changed and no explicit sentiment provided
      if (!sentiment) {
        const newSentiment = await analyzeSentiment(updateData.reviewText);
        if (newSentiment) {
          updateData.sentiment = newSentiment;
        }
      }
    }

    if (sentiment !== undefined) {
      updateData.sentiment = sentiment;
    }

    if (bookId !== undefined) {
      updateData.bookId = bookId;
    }

    // Update review
    const updatedReview = await updateReview(reviewId, updateData);

    // Cleanup orphan books if book was reassigned
    if (bookId !== undefined && oldBookId && oldBookId !== bookId) {
      const orphansDeleted = await cleanupOrphanBooks();

      if (orphansDeleted > 0) {
        console.log(
          `[ReviewUpdate] Cleaned up ${orphansDeleted} orphan book(s)`
        );
      }
    }

    // Send admin notification
    const userName =
      req.telegramUser!.username ||
      req.telegramUser!.first_name ||
      "Unknown User";

    const changes: string[] = [];
    if (reviewText !== undefined) changes.push("text");
    if (sentiment !== undefined) changes.push("sentiment");
    if (bookId !== undefined) changes.push("book assignment");

    await sendInfoNotification(
      `Review #${reviewId} edited by ${userName}`,
      {
        operation: "Review Update",
        additionalInfo: `Changes: ${changes.join(", ")}${
          bookId !== undefined
            ? `\nNew book: ${updatedReview.book?.title || "None"}`
            : ""
        }`,
      }
    );

    // Format response
    const formattedReview = {
      id: updatedReview.id,
      reviewerName:
        updatedReview.telegramDisplayName ||
        updatedReview.telegramUsername ||
        "Anonymous",
      reviewerUsername: updatedReview.telegramUsername,
      telegramUserId: updatedReview.telegramUserId.toString(),
      reviewText: updatedReview.reviewText,
      sentiment: updatedReview.sentiment,
      reviewedAt: updatedReview.reviewedAt.toISOString(),
      messageId: updatedReview.messageId?.toString(),
      chatId: updatedReview.chatId?.toString(),
      book: updatedReview.book
        ? {
            id: updatedReview.book.id,
            title: updatedReview.book.title,
            author: updatedReview.book.author,
            coverUrl: updatedReview.book.coverUrl,
          }
        : null,
    };

    res.json({
      review: formattedReview,
      message: "Review updated successfully",
    });
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({ error: "Failed to update review" });
  }
});

export default router;
