/**
 * Monthly Digest Service
 * Generates digest with top books and top reviewers for the last 30 days
 */

import prisma from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { getBookDeepLink } from "../lib/url-utils.js";
import { getRussianPluralReview } from "../lib/string-utils.js";

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
  limit = 5
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
 * Format sentiment emojis for display
 */
function formatSentimentEmojis(sentiment: { positive: number; negative: number; neutral: number }): string {
  const parts: string[] = [];
  if (sentiment.positive > 0) parts.push(`${sentiment.positive}👍`);
  if (sentiment.neutral > 0) parts.push(`${sentiment.neutral}😐`);
  if (sentiment.negative > 0) parts.push(`${sentiment.negative}👎`);
  return parts.join(", ");
}

/**
 * Generate full monthly digest message in HTML format
 */
export async function generateMonthlyDigest(): Promise<string> {
  const [topBooks, topReviewers] = await Promise.all([
    getTopBooksLast30Days(5, 2),
    getTopReviewersLast30Days(5),
  ]);

  const lines: string[] = [];

  lines.push("📊 <b>Дайджест за последние 30 дней</b>\n");

  // Top Books Section
  lines.push("📚 <b>Топ книг</b>");
  if (topBooks.length > 0) {
    for (let i = 0; i < topBooks.length; i++) {
      const book = topBooks[i];
      const bookLink = getBookDeepLink(config.botUsername, book.bookId);
      const authorPart = book.author ? ` — ${book.author}` : "";
      const emojis = formatSentimentEmojis(book.sentiment);

      lines.push(
        `${i + 1}. <a href="${bookLink}">${escapeHtml(book.title)}${escapeHtml(authorPart)}</a> (${emojis})`
      );
    }
  } else {
    lines.push("Недостаточно данных (нужно минимум 2 рецензии на книгу)");
  }

  lines.push("");

  // Top Reviewers Section
  lines.push("🏆 <b>Топ клубней</b>");
  if (topReviewers.length > 0) {
    for (let i = 0; i < topReviewers.length; i++) {
      const reviewer = topReviewers[i];
      const name = reviewer.displayName || reviewer.username || "Anonymous";
      const reviewWord = getRussianPluralReview(reviewer.reviewCount);
      lines.push(`${i + 1}. ${escapeHtml(name)} (${reviewer.reviewCount} ${reviewWord})`);
    }
  } else {
    lines.push("Нет рецензий за этот период");
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
