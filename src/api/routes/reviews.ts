import { Router } from "express";
import {
  getRandomReviews,
  getRecentReviews,
  updateReview,
  deleteReview,
  isReviewOwner,
  isAdmin,
  isChatMember,
  getReviewById,
  cleanupOrphanBooks,
} from "../../services/review.service.js";
import { authenticateTelegramWebApp } from "../middleware/telegram-auth.js";
import { sendInfoNotification } from "../../services/notification.service.js";
import { analyzeSentiment } from "../../services/sentiment.js";
import { findOrCreateBookFromExternalMetadata } from "../../services/book.service.js";
import { config } from "../../lib/config.js";

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
    const { limit = "20", offset = "0", needsHelp } = req.query;
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid limit or offset parameter" });
      return;
    }

    const reviews = await getRecentReviews(parsedLimit, parsedOffset, needsHelp === "true");

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

// GET /api/reviews/:id - Get a single review by ID
router.get("/:id", async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id, 10);

    if (isNaN(reviewId)) {
      res.status(400).json({ error: "Invalid review ID" });
      return;
    }

    const review = await getReviewById(reviewId);

    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    // Format response
    const formattedReview = {
      id: review.id,
      reviewerName:
        review.telegramDisplayName ||
        review.telegramUsername ||
        "Anonymous",
      reviewerUsername: review.telegramUsername,
      telegramUserId: review.telegramUserId.toString(),
      reviewText: review.reviewText,
      sentiment: review.sentiment,
      reviewedAt: review.reviewedAt.toISOString(),
      messageId: review.messageId?.toString(),
      chatId: review.chatId?.toString(),
      book: review.book
        ? {
            id: review.book.id,
            title: review.book.title,
            author: review.book.author,
            coverUrl: review.book.coverUrl,
          }
        : null,
    };

    res.json({ review: formattedReview });
  } catch (error) {
    console.error("Error fetching review:", error);
    res.status(500).json({ error: "Failed to fetch review" });
  }
});

// PATCH /api/reviews/:id - Update a review
router.patch("/:id", authenticateTelegramWebApp, async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id, 10);
    const { reviewText, sentiment, bookId, googleBooksData } = req.body;

    if (isNaN(reviewId)) {
      res.status(400).json({ error: "Invalid review ID" });
      return;
    }

    // Validate mutually exclusive book assignment methods
    if (bookId !== undefined && googleBooksData !== undefined) {
      res
        .status(400)
        .json({ error: "Cannot specify both bookId and googleBooksData" });
      return;
    }

    // Check if review exists
    const existingReview = await getReviewById(reviewId);
    if (!existingReview) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    // Check ownership (allow admin or chat member to edit)
    const isOwner = await isReviewOwner(reviewId, req.telegramUser!.id);
    const userIsAdmin = isAdmin(req.telegramUser!.id);
    const userIsChatMember = isChatMember(req.telegramUser!);

    if (!isOwner && !userIsAdmin && !userIsChatMember) {
      res.status(403).json({ error: "You can only edit your own reviews unless you are a chat member" });
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

    // Handle external book API data - create book first if needed
    if (googleBooksData) {
      try {
        const { id: createdBookId, isNew } =
          await findOrCreateBookFromExternalMetadata(googleBooksData);
        updateData.bookId = createdBookId;

        if (isNew) {
          console.log(
            `[ReviewUpdate] Created new book from external API: ${googleBooksData.title}`
          );
        } else {
          console.log(
            `[ReviewUpdate] Found existing book: ${googleBooksData.title}`
          );
        }
      } catch (error) {
        console.error(
          "[ReviewUpdate] Error creating book from external API:",
          error
        );

        // Check for rate limit error
        if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
          res
            .status(429)
            .json({ error: "External book API rate limit exceeded. Please try again later." });
          return;
        }

        res
          .status(500)
          .json({ error: "Failed to create book from external API data" });
        return;
      }
    } else if (bookId !== undefined) {
      updateData.bookId = bookId;
    }

    // Update review
    const updatedReview = await updateReview(reviewId, updateData);

    // Cleanup orphan books if book was reassigned
    if (
      (bookId !== undefined || googleBooksData !== undefined) &&
      oldBookId &&
      oldBookId !== updatedReview.bookId
    ) {
      const orphansDeleted = await cleanupOrphanBooks();

      if (orphansDeleted > 0) {
        console.log(
          `[ReviewUpdate] Cleaned up ${orphansDeleted} orphan book(s)`
        );
      }
    }

    // Send admin notification with before/after
    const editorInfo = `@${req.telegramUser!.username || 'unknown'} (${req.telegramUser!.first_name || 'Unknown'}, ID: ${req.telegramUser!.id})`;
    const notificationHeader = userIsAdmin ? 'Admin' : (userIsChatMember ? 'Volunteer' : 'User');

    const changes: string[] = [];
    if (reviewText !== undefined && existingReview.reviewText !== updatedReview.reviewText) {
      const oldText = existingReview.reviewText.slice(0, 50) + '...';
      const newText = updatedReview.reviewText.slice(0, 50) + '...';
      changes.push(`• Review Text: "${oldText}" → "${newText}"`);
    }
    if (sentiment !== undefined && existingReview.sentiment !== updatedReview.sentiment) {
      changes.push(`• Sentiment: ${existingReview.sentiment} → ${updatedReview.sentiment}`);
    }
    if (existingReview.bookId !== updatedReview.bookId) {
      const oldBook = existingReview.book?.title || 'None';
      const newBook = updatedReview.book?.title || 'None';
      changes.push(`• Book: ${oldBook} → ${newBook}`);
    }

    if (changes.length > 0) {
      await sendInfoNotification(
        `📝 Review Edited by ${notificationHeader}\n\nEditor: ${editorInfo}\n\nReview ID: ${reviewId}${!isOwner ? `\nOriginal Author: @${existingReview.telegramUsername || 'unknown'}` : ''}\n\nChanges:\n${changes.join('\n')}\n\n🔗 View: ${config.miniAppUrl}?startapp=review_${reviewId}\n\n⏰ ${new Date().toISOString()}`,
        { operation: 'Review Update' }
      );
    }

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

// DELETE /api/reviews/:id - Delete a review
router.delete("/:id", authenticateTelegramWebApp, async (req, res) => {
  try {
    const reviewId = parseInt(req.params.id, 10);

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
    const userIsAdmin = isAdmin(req.telegramUser!.id);
    if (!isOwner && !userIsAdmin) {
      res.status(403).json({ error: "You can only delete your own reviews" });
      return;
    }

    // Store book ID for orphan cleanup
    const bookId = existingReview.bookId;

    // Delete the review
    const deletedReview = await deleteReview(reviewId);

    // Cleanup orphan books if the review had a book
    if (bookId) {
      const orphansDeleted = await cleanupOrphanBooks();

      if (orphansDeleted > 0) {
        console.log(
          `[ReviewDelete] Cleaned up ${orphansDeleted} orphan book(s)`
        );
      }
    }

    // Send admin notification
    const userName =
      req.telegramUser!.username ||
      req.telegramUser!.first_name ||
      "Unknown User";

    const reviewTextPreview =
      deletedReview.reviewText.length > 200
        ? deletedReview.reviewText.substring(0, 200) + "..."
        : deletedReview.reviewText;

    const actionLabel = isOwner ? "Review Deleted" : "Review Deleted (ADMIN)";

    await sendInfoNotification(
      `📕 ${actionLabel}\n\nUser: ${
        deletedReview.telegramUsername
          ? `@${deletedReview.telegramUsername}`
          : userName
      } (${deletedReview.telegramDisplayName || "No display name"})${
        !isOwner ? `\nDeleted by admin: @${req.telegramUser!.username || 'unknown'}` : ''
      }\nBook: ${
        deletedReview.book
          ? `"${deletedReview.book.title}"${
              deletedReview.book.author ? ` by ${deletedReview.book.author}` : ""
            }`
          : "No book assigned"
      }\nReview: ${reviewTextPreview}`,
      {
        operation: "Review Deletion",
        additionalInfo: `Review ID: ${reviewId}`,
      }
    );

    res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

export default router;
