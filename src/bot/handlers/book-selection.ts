import { Context } from "telegraf";
import prisma from "../../lib/prisma.js";
import { extractBookInfo } from "../../services/llm.js";
import { findOrCreateBook, findOrCreateBookByISBN } from "../../services/book.service.js";

// Store pending ISBN inputs (in production, use Redis or DB)
const pendingISBNInputs = new Map<string, number>(); // userId -> reviewId

// Store pending reviews that need ISBN (when extraction fails)
interface PendingReview {
  telegramUserId: bigint;
  telegramUsername?: string | null;
  telegramDisplayName?: string | null;
  reviewText: string;
  messageId: bigint;
  chatId: bigint | null;
  reviewedAt: Date;
}
const pendingReviews = new Map<string, PendingReview>(); // userId -> review data

export async function handleBookConfirmed(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("data" in callbackQuery)) return;

  const reviewId = parseInt(callbackQuery.data.split(":")[1]);

  await ctx.answerCbQuery("✅ Book confirmed!");
  await ctx.editMessageText("✅ Review saved successfully!");
}

export async function handleBookAlternative(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("data" in callbackQuery)) return;

  const parts = callbackQuery.data.split(":");
  const reviewId = parseInt(parts[1]);
  const altIndex = parseInt(parts[2]);

  // Get the review
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { reviewText: true },
  });

  if (!review) {
    await ctx.answerCbQuery("❌ Review not found");
    return;
  }

  // Re-extract book info to get alternative books
  const bookInfo = await extractBookInfo(review.reviewText);

  if (!bookInfo || !bookInfo.alternativeBooks || !bookInfo.alternativeBooks[altIndex]) {
    await ctx.answerCbQuery("❌ Alternative book not found");
    return;
  }

  const altBook = bookInfo.alternativeBooks[altIndex];

  // Find or create the alternative book
  const { id: bookId } = await findOrCreateBook(
    altBook.title,
    altBook.author
  );

  // Update the review to point to the new book
  await prisma.review.update({
    where: { id: reviewId },
    data: { bookId },
  });

  await ctx.answerCbQuery("✅ Book updated!");
  await ctx.editMessageText(
    `✅ Review updated to: "${altBook.title}"${altBook.author ? ` by ${altBook.author}` : ""}`
  );
}

export async function handleBookISBN(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("data" in callbackQuery) || !("from" in callbackQuery)) return;

  const reviewId = parseInt(callbackQuery.data.split(":")[1]);
  const userId = callbackQuery.from.id.toString();

  // Store the pending ISBN input
  pendingISBNInputs.set(userId, reviewId);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📖 Please send the ISBN of the book (ISBN-10 or ISBN-13).\n\n" +
    "Example: 978-0-7475-3269-9\n\n" +
    "Send /cancel to abort."
  );
}

export async function handleISBNInput(ctx: Context) {
  const message = ctx.message;
  if (!message || !("text" in message) || !("from" in message)) return;

  const userId = message.from.id.toString();
  const reviewId = pendingISBNInputs.get(userId);

  if (!reviewId) {
    // Not expecting ISBN input from this user
    return;
  }

  const isbn = message.text.trim();

  // Validate ISBN format (basic check)
  const isbnRegex = /^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/;

  if (!isbnRegex.test(isbn)) {
    await ctx.reply(
      "❌ Invalid ISBN format. Please try again or send /cancel to abort.",
      { reply_parameters: { message_id: message.message_id } }
    );
    return;
  }

  // Clear pending input
  pendingISBNInputs.delete(userId);

  const processingMsg = await ctx.reply("🔍 Searching for book by ISBN...", {
    reply_parameters: { message_id: message.message_id },
  });

  try {
    // Find or create book by ISBN
    const result = await findOrCreateBookByISBN(isbn);

    if (!result) {
      await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
      await ctx.reply(
        "❌ Could not find book with this ISBN. Please check the ISBN and try again.",
        { reply_parameters: { message_id: message.message_id } }
      );
      return;
    }

    // Update the review to point to the found book
    await prisma.review.update({
      where: { id: reviewId },
      data: { bookId: result.id },
    });

    const book = await prisma.book.findUnique({
      where: { id: result.id },
      select: { title: true, author: true },
    });

    await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    await ctx.reply(
      `✅ Book found and review updated!\n\n📖 ${book?.title || "Unknown"}${
        book?.author ? `\n✍️ ${book.author}` : ""
      }`,
      { reply_parameters: { message_id: message.message_id } }
    );
  } catch (error) {
    console.error("Error processing ISBN:", error);
    await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    await ctx.reply(
      "❌ Error processing ISBN. Please try again.",
      { reply_parameters: { message_id: message.message_id } }
    );
  }
}

export async function handleCancelISBN(ctx: Context) {
  const message = ctx.message;
  if (!message || !("from" in message)) return;

  const userId = message.from.id.toString();
  const hadPendingISBN = pendingISBNInputs.has(userId);
  const hadPendingReview = pendingReviews.has(userId);

  pendingISBNInputs.delete(userId);
  pendingReviews.delete(userId);

  if (hadPendingISBN || hadPendingReview) {
    await ctx.reply("❌ ISBN input cancelled. Review was not saved.");
  }
}

/**
 * Store pending review data when book extraction fails
 * Returns true if stored, false if user already has a pending review
 */
export function storePendingReview(userId: string, reviewData: PendingReview): boolean {
  if (pendingReviews.has(userId)) {
    return false; // Already have a pending review for this user
  }
  pendingReviews.set(userId, reviewData);
  return true;
}

/**
 * Handle ISBN input for a pending review (when extraction failed)
 */
export async function handlePendingReviewISBN(ctx: Context) {
  const message = ctx.message;
  if (!message || !("text" in message) || !("from" in message)) return false;

  const userId = message.from.id.toString();
  const pendingReview = pendingReviews.get(userId);

  if (!pendingReview) {
    return false; // Not handling a pending review
  }

  const isbn = message.text.trim();

  // Validate ISBN format (basic check)
  const isbnRegex = /^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/;

  if (!isbnRegex.test(isbn)) {
    await ctx.reply(
      "❌ Invalid ISBN format. Please try again or send /cancel to abort.",
      { reply_parameters: { message_id: message.message_id } }
    );
    return true;
  }

  // Clear pending review
  pendingReviews.delete(userId);

  const processingMsg = await ctx.reply("🔍 Searching for book by ISBN...", {
    reply_parameters: { message_id: message.message_id },
  });

  try {
    // Find or create book by ISBN
    const bookResult = await findOrCreateBookByISBN(isbn);

    if (!bookResult) {
      await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
      await ctx.reply(
        "❌ Could not find book with this ISBN. Please check the ISBN and try again, or send /cancel to abort.",
        { reply_parameters: { message_id: message.message_id } }
      );
      // Restore pending review so user can try again
      pendingReviews.set(userId, pendingReview);
      return true;
    }

    // Create the review with the found book
    const { createReview } = await import("../../services/review.service.js");
    const { analyzeSentiment } = await import("../../services/sentiment.js");

    const sentiment = await analyzeSentiment(pendingReview.reviewText);

    const review = await createReview({
      bookId: bookResult.id,
      telegramUserId: pendingReview.telegramUserId,
      telegramUsername: pendingReview.telegramUsername,
      telegramDisplayName: pendingReview.telegramDisplayName,
      reviewText: pendingReview.reviewText,
      messageId: pendingReview.messageId,
      chatId: pendingReview.chatId,
      reviewedAt: pendingReview.reviewedAt,
      sentiment,
    });

    const book = await prisma.book.findUnique({
      where: { id: bookResult.id },
      select: { title: true, author: true },
    });

    // Get review count for this book
    const reviewCount = await prisma.review.count({
      where: { bookId: bookResult.id },
    });

    await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);

    const sentimentEmoji =
      sentiment === "positive" ? "👍" : sentiment === "negative" ? "👎" : "😐";

    await ctx.reply(
      `✅ Book found and review saved!\n\n📖 ${book?.title || "Unknown"}${
        book?.author ? `\n✍️ ${book.author}` : ""
      }\n\nThis is review #${reviewCount} for this book. ${sentimentEmoji}`,
      { reply_parameters: { message_id: message.message_id } }
    );

    return true;
  } catch (error) {
    console.error("Error processing ISBN for pending review:", error);
    await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    await ctx.reply(
      "❌ Error processing ISBN. Please try again.",
      { reply_parameters: { message_id: message.message_id } }
    );
    // Restore pending review so user can try again
    pendingReviews.set(userId, pendingReview);
    return true;
  }
}
