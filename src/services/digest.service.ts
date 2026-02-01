/**
 * Monthly Digest Service
 * Generates digest with top books, top reviewers, and best reviews for the last 30 days
 */

import prisma from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { getBookDeepLink } from "../lib/url-utils.js";
import { getRussianPluralReview } from "../lib/string-utils.js";
import { botInstance } from "../bot/index.js";

export interface TopBookEntry {
  bookId: number;
  title: string;
  author: string | null;
  reviewCount: number;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface TopReviewerEntry {
  telegramUserId: string;
  username: string | null;
  displayName: string | null;
  reviewCount: number;
}

export interface BestReviewEntry {
  reviewId: number;
  bookId: number;
  bookTitle: string;
  reviewerName: string;
  messageId: bigint;
  chatId: bigint;
  reactionCount: number;
}

/**
 * Get top books for the last 30 days with at least minReviews reviews
 */
export async function getTopBooksLast30Days(
  limit = 5,
  minReviews = 2
): Promise<TopBookEntry[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  // Get books with review counts in the last 30 days
  const reviewCounts = await prisma.review.groupBy({
    by: ["bookId"],
    where: {
      bookId: { not: null },
      reviewedAt: { gte: startDate },
    },
    _count: { id: true },
    having: {
      id: { _count: { gte: minReviews } },
    },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  if (reviewCounts.length === 0) {
    return [];
  }

  const bookIds = reviewCounts
    .map((r: { bookId: number | null }) => r.bookId)
    .filter((id: number | null): id is number => id !== null);

  // Fetch book details
  const books = await prisma.book.findMany({
    where: { id: { in: bookIds } },
  });

  type BookType = typeof books[number];
  const bookMap = new Map<number, BookType>(books.map((book: BookType) => [book.id, book]));

  // Get sentiment breakdown for each book (for reviews in last 30 days only)
  const results: TopBookEntry[] = [];

  for (const rc of reviewCounts) {
    const book = bookMap.get(rc.bookId!);
    if (!book) continue;

    // Get sentiment counts for this book in the last 30 days
    const sentimentCounts = await prisma.review.groupBy({
      by: ["sentiment"],
      where: {
        bookId: rc.bookId,
        reviewedAt: { gte: startDate },
      },
      _count: { sentiment: true },
    });

    const sentiment = { positive: 0, negative: 0, neutral: 0 };
    for (const item of sentimentCounts) {
      if (item.sentiment === "positive") sentiment.positive = item._count.sentiment;
      else if (item.sentiment === "negative") sentiment.negative = item._count.sentiment;
      else if (item.sentiment === "neutral") sentiment.neutral = item._count.sentiment;
    }

    results.push({
      bookId: book.id,
      title: book.title,
      author: book.author,
      reviewCount: rc._count.id,
      sentiment,
    });
  }

  return results;
}

/**
 * Get top reviewers for the last 30 days
 */
export async function getTopReviewersLast30Days(
  limit = 10
): Promise<TopReviewerEntry[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const results = await prisma.review.groupBy({
    by: ["telegramUserId", "telegramUsername", "telegramDisplayName"],
    where: {
      reviewedAt: { gte: startDate },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  return results.map((r: {
    telegramUserId: bigint;
    telegramUsername: string | null;
    telegramDisplayName: string | null;
    _count: { id: number };
  }) => ({
    telegramUserId: r.telegramUserId.toString(),
    username: r.telegramUsername,
    displayName: r.telegramDisplayName,
    reviewCount: r._count.id,
  }));
}

/**
 * Get reviews from last 30 days with message IDs for reaction fetching
 */
async function getReviewsForReactionFetching(): Promise<
  Array<{
    id: number;
    bookId: number | null;
    bookTitle: string;
    reviewerName: string;
    messageId: bigint;
    chatId: bigint;
  }>
> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const reviews = await prisma.review.findMany({
    where: {
      reviewedAt: { gte: startDate },
      messageId: { not: null },
      chatId: { not: null },
      bookId: { not: null },
    },
    include: {
      book: {
        select: { title: true },
      },
    },
    orderBy: { reviewedAt: "desc" },
  });

  type ReviewWithBook = typeof reviews[number];
  return reviews
    .filter((r: ReviewWithBook) => r.messageId !== null && r.chatId !== null && r.book !== null)
    .map((r: ReviewWithBook) => ({
      id: r.id,
      bookId: r.bookId,
      bookTitle: r.book!.title,
      reviewerName: r.telegramDisplayName || r.telegramUsername || "Anonymous",
      messageId: r.messageId!,
      chatId: r.chatId!,
    }));
}

interface ReactionCount {
  type: { type: string; emoji?: string };
  total_count: number;
}

/**
 * Fetch reaction count for a message using Telegram API
 * Returns total number of reactions or 0 if unavailable
 */
async function getMessageReactionCount(
  chatId: bigint,
  messageId: bigint
): Promise<number> {
  if (!botInstance) {
    return 0;
  }

  try {
    // Use Telegram Bot API to get message reactions
    // The getMessageReactionCount is available in Telegram Bot API 7.2+
    // We need to use the raw API call with any type since Telegraf types don't include this method
    const telegram = botInstance.telegram as unknown as {
      callApi: (method: string, params: Record<string, unknown>) => Promise<unknown>;
    };

    const result = await telegram.callApi("getMessageReactionCount", {
      chat_id: chatId.toString(),
      message_id: Number(messageId),
    });

    // Result is an array of reaction counts
    if (Array.isArray(result)) {
      const reactions = result as ReactionCount[];
      return reactions.reduce((sum: number, r: ReactionCount) => sum + (r.total_count || 0), 0);
    }

    return 0;
  } catch {
    // Message may have been deleted or reactions not available
    return 0;
  }
}

/**
 * Get best reviews based on reaction count
 */
export async function getBestReviewsLast30Days(
  limit = 3
): Promise<BestReviewEntry[]> {
  const reviews = await getReviewsForReactionFetching();

  if (reviews.length === 0) {
    return [];
  }

  // Fetch reactions for each review
  const reviewsWithReactions: BestReviewEntry[] = [];

  for (const review of reviews) {
    const reactionCount = await getMessageReactionCount(
      review.chatId,
      review.messageId
    );

    reviewsWithReactions.push({
      reviewId: review.id,
      bookId: review.bookId!,
      bookTitle: review.bookTitle,
      reviewerName: review.reviewerName,
      messageId: review.messageId,
      chatId: review.chatId,
      reactionCount,
    });
  }

  // Sort by reaction count descending and take top N
  return reviewsWithReactions
    .sort((a, b) => b.reactionCount - a.reactionCount)
    .slice(0, limit);
}

/**
 * Format sentiment stats for display
 */
function formatSentiment(sentiment: { positive: number; negative: number; neutral: number }): string {
  const parts: string[] = [];
  if (sentiment.positive > 0) parts.push(`${sentiment.positive} +`);
  if (sentiment.negative > 0) parts.push(`${sentiment.negative} -`);
  if (sentiment.neutral > 0) parts.push(`${sentiment.neutral} ~`);
  return parts.join(" / ") || "нет оценок";
}

/**
 * Generate full monthly digest message in HTML format
 */
export async function generateMonthlyDigest(): Promise<string> {
  const [topBooks, topReviewers, bestReviews] = await Promise.all([
    getTopBooksLast30Days(5, 2),
    getTopReviewersLast30Days(10),
    getBestReviewsLast30Days(3),
  ]);

  const lines: string[] = [];

  lines.push("📊 <b>Дайджест за последние 30 дней</b>\n");

  // Top Books Section
  lines.push("📚 <b>Топ книг</b>");
  if (topBooks.length > 0) {
    for (let i = 0; i < topBooks.length; i++) {
      const book = topBooks[i];
      const reviewWord = getRussianPluralReview(book.reviewCount);
      const bookLink = getBookDeepLink(config.botUsername, book.bookId);
      const authorPart = book.author ? ` — ${book.author}` : "";
      const sentimentText = formatSentiment(book.sentiment);

      lines.push(
        `${i + 1}. <a href="${bookLink}">${escapeHtml(book.title)}${escapeHtml(authorPart)}</a>`
      );
      lines.push(`   ${book.reviewCount} ${reviewWord} (${sentimentText})`);
    }
  } else {
    lines.push("Недостаточно данных (нужно минимум 2 рецензии на книгу)");
  }

  lines.push("");

  // Top Reviewers Section
  lines.push("🏆 <b>Топ рецензентов</b>");
  if (topReviewers.length > 0) {
    for (let i = 0; i < topReviewers.length; i++) {
      const reviewer = topReviewers[i];
      const name = reviewer.displayName || reviewer.username || "Anonymous";
      const reviewWord = getRussianPluralReview(reviewer.reviewCount);
      lines.push(`${i + 1}. ${escapeHtml(name)} — ${reviewer.reviewCount} ${reviewWord}`);
    }
  } else {
    lines.push("Нет рецензий за этот период");
  }

  lines.push("");

  // Best Reviews Section
  lines.push("⭐ <b>Лучшие рецензии</b> (по реакциям)");
  if (bestReviews.length > 0 && bestReviews.some((r) => r.reactionCount > 0)) {
    const reviewsWithReactions = bestReviews.filter((r) => r.reactionCount > 0);
    for (let i = 0; i < reviewsWithReactions.length; i++) {
      const review = reviewsWithReactions[i];
      // Create link to the original message in chat
      const messageLink = `https://t.me/c/${review.chatId.toString().replace("-100", "")}/${review.messageId}`;
      lines.push(
        `${i + 1}. ${escapeHtml(review.reviewerName)} о «${escapeHtml(review.bookTitle)}» — <a href="${messageLink}">${review.reactionCount} реакций</a>`
      );
    }
    if (reviewsWithReactions.length === 0) {
      lines.push("Нет рецензий с реакциями");
    }
  } else {
    lines.push("Нет рецензий с реакциями");
  }

  return lines.join("\n");
}

/**
 * Escape HTML special characters for Telegram message
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
