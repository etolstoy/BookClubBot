import prisma from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { analyzeSentiment, type Sentiment } from "./sentiment.js";
import { processReviewText } from "./book.service.js";
import type { ExtractedBookInfo } from "../lib/interfaces/llm-client.interface.js";

export interface CreateReviewInput {
  bookId?: number | null;
  telegramUserId: bigint;
  telegramUsername?: string | null;
  telegramDisplayName?: string | null;
  reviewText: string;
  messageId?: bigint | null;
  chatId?: bigint | null;
  reviewedAt: Date;
  sentiment?: Sentiment | null;
}

export async function createReview(input: CreateReviewInput) {
  return prisma.review.create({
    data: {
      bookId: input.bookId,
      telegramUserId: input.telegramUserId,
      telegramUsername: input.telegramUsername,
      telegramDisplayName: input.telegramDisplayName,
      reviewText: input.reviewText,
      sentiment: input.sentiment,
      messageId: input.messageId,
      chatId: input.chatId,
      reviewedAt: input.reviewedAt,
    },
    include: {
      book: true,
    },
  });
}

export async function processAndCreateReview(input: {
  telegramUserId: bigint;
  telegramUsername?: string | null;
  telegramDisplayName?: string | null;
  reviewText: string;
  messageId?: bigint | null;
  chatId?: bigint | null;
  reviewedAt: Date;
}): Promise<{
  review: Awaited<ReturnType<typeof createReview>>;
  isNewBook: boolean;
  reviewCount: number;
  bookInfo?: ExtractedBookInfo;
} | null> {
  // Process the review text to extract and find/create the book
  const bookResult = await processReviewText(input.reviewText);

  if (!bookResult) {
    // Could not identify book - return null to trigger ISBN prompt
    return null;
  }

  // Analyze sentiment
  const sentiment = await analyzeSentiment(input.reviewText);

  // Create the review
  const review = await createReview({
    ...input,
    bookId: bookResult.bookId,
    sentiment,
  });

  // Get review count for this book
  const reviewCount = await prisma.review.count({
    where: { bookId: bookResult.bookId },
  });

  return {
    review,
    isNewBook: bookResult.isNewBook,
    reviewCount,
    bookInfo: bookResult.bookInfo,
  };
}

export async function getReviewById(id: number) {
  return prisma.review.findUnique({
    where: { id },
    include: { book: true },
  });
}

export async function getReviewsByUserId(
  telegramUserId: bigint,
  options?: { limit?: number; offset?: number }
) {
  const { limit = 50, offset = 0 } = options || {};

  return prisma.review.findMany({
    where: { telegramUserId },
    include: { book: true },
    orderBy: { reviewedAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function getReviewsByBookId(
  bookId: number,
  options?: { limit?: number; offset?: number; sentiment?: Sentiment }
) {
  const { limit = 50, offset = 0, sentiment } = options || {};

  return prisma.review.findMany({
    where: {
      bookId,
      ...(sentiment ? { sentiment } : {}),
    },
    orderBy: { reviewedAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function getUserReviewStats(telegramUserId: bigint) {
  const totalReviews = await prisma.review.count({
    where: { telegramUserId },
  });

  const bySentiment = await prisma.review.groupBy({
    by: ["sentiment"],
    where: { telegramUserId },
    _count: { sentiment: true },
  });

  const sentimentCounts = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };

  for (const item of bySentiment) {
    if (item.sentiment === "positive") sentimentCounts.positive = item._count.sentiment;
    else if (item.sentiment === "negative") sentimentCounts.negative = item._count.sentiment;
    else if (item.sentiment === "neutral") sentimentCounts.neutral = item._count.sentiment;
  }

  return {
    totalReviews,
    sentimentCounts,
  };
}

export async function checkDuplicateReview(
  telegramUserId: bigint,
  messageId: bigint
): Promise<boolean> {
  const existing = await prisma.review.findFirst({
    where: {
      telegramUserId,
      messageId,
    },
  });

  return !!existing;
}

// Types for leaderboard results
interface ReviewerLeaderboardEntry {
  rank: number;
  telegramUserId: string;
  username: string | null;
  displayName: string | null;
  reviewCount: number;
}

interface BookLeaderboardEntry {
  rank: number;
  bookId: number;
  title: string;
  author: string | null;
  coverUrl: string | null;
  reviewCount: number;
}

interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

// Helper to create date range for different period types
function getDateRange(
  period: "monthly" | "yearly" | "last30days" | "last365days" | "all",
  year?: number,
  month?: number
): DateRange {
  switch (period) {
    case "monthly":
      return {
        startDate: new Date(year!, month! - 1, 1),
        endDate: new Date(year!, month!, 1),
      };
    case "yearly":
      return {
        startDate: new Date(year!, 0, 1),
        endDate: new Date(year! + 1, 0, 1),
      };
    case "last30days": {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      return { startDate };
    }
    case "last365days": {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 365);
      return { startDate };
    }
    case "all":
    default:
      return {};
  }
}

// Core reviewer leaderboard function
async function getReviewerLeaderboard(
  dateRange: DateRange,
  limit: number
): Promise<ReviewerLeaderboardEntry[]> {
  const whereClause: Record<string, unknown> = {};

  if (dateRange.startDate || dateRange.endDate) {
    whereClause.reviewedAt = {};
    if (dateRange.startDate) {
      (whereClause.reviewedAt as Record<string, Date>).gte = dateRange.startDate;
    }
    if (dateRange.endDate) {
      (whereClause.reviewedAt as Record<string, Date>).lt = dateRange.endDate;
    }
  }

  const results = await prisma.review.groupBy({
    by: ["telegramUserId", "telegramUsername", "telegramDisplayName"],
    where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  return results.map((r, index) => ({
    rank: index + 1,
    telegramUserId: r.telegramUserId.toString(),
    username: r.telegramUsername,
    displayName: r.telegramDisplayName,
    reviewCount: r._count.id,
  }));
}

export function getMonthlyLeaderboard(
  year: number,
  month: number,
  limit = 10
): Promise<ReviewerLeaderboardEntry[]> {
  return getReviewerLeaderboard(getDateRange("monthly", year, month), limit);
}

export function getYearlyLeaderboard(
  year: number,
  limit = 10
): Promise<ReviewerLeaderboardEntry[]> {
  return getReviewerLeaderboard(getDateRange("yearly", year), limit);
}

export function getOverallLeaderboard(limit = 10): Promise<ReviewerLeaderboardEntry[]> {
  return getReviewerLeaderboard(getDateRange("all"), limit);
}

export function getLast30DaysLeaderboard(limit = 10): Promise<ReviewerLeaderboardEntry[]> {
  return getReviewerLeaderboard(getDateRange("last30days"), limit);
}

export function getLast365DaysLeaderboard(limit = 10): Promise<ReviewerLeaderboardEntry[]> {
  return getReviewerLeaderboard(getDateRange("last365days"), limit);
}

export async function getMostReviewedBooks(limit = 10, offset = 0, period?: { type: 'monthly' | 'yearly'; year: number; month?: number }) {
  let whereClause = {};

  if (period) {
    if (period.type === 'monthly' && period.month) {
      const startDate = new Date(period.year, period.month - 1, 1);
      const endDate = new Date(period.year, period.month, 1);
      whereClause = {
        reviews: {
          some: {
            reviewedAt: {
              gte: startDate,
              lt: endDate,
            },
          },
        },
      };
    } else if (period.type === 'yearly') {
      const startDate = new Date(period.year, 0, 1);
      const endDate = new Date(period.year + 1, 0, 1);
      whereClause = {
        reviews: {
          some: {
            reviewedAt: {
              gte: startDate,
              lt: endDate,
            },
          },
        },
      };
    }
  }

  const results = await prisma.book.findMany({
    where: whereClause,
    include: {
      _count: {
        select: { reviews: true },
      },
    },
    orderBy: {
      reviews: {
        _count: "desc",
      },
    },
    take: limit,
    skip: offset,
  });

  return results.map((book: { id: number; title: string; author: string | null; coverUrl: string | null; _count: { reviews: number } }, index: number) => ({
    rank: offset + index + 1,
    bookId: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    reviewCount: book._count.reviews,
  }));
}

// Core function for getting most reviewed books with date filter
async function getMostReviewedBooksWithDateFilter(
  startDate: Date,
  limit: number,
  offset: number
): Promise<BookLeaderboardEntry[]> {
  const reviewCounts = await prisma.review.groupBy({
    by: ["bookId"],
    where: {
      bookId: { not: null },
      reviewedAt: { gte: startDate },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
    skip: offset,
  });

  const bookIds = reviewCounts
    .map((r) => r.bookId)
    .filter((id): id is number => id !== null);

  const books = await prisma.book.findMany({
    where: { id: { in: bookIds } },
  });

  const bookMap = new Map(books.map((book) => [book.id, book]));

  return reviewCounts.map((rc, index) => {
    const book = bookMap.get(rc.bookId!);
    return {
      rank: offset + index + 1,
      bookId: rc.bookId!,
      title: book?.title || "Unknown",
      author: book?.author || null,
      coverUrl: book?.coverUrl || null,
      reviewCount: rc._count.id,
    };
  });
}

export function getLast30DaysMostReviewedBooks(
  limit = 10,
  offset = 0
): Promise<BookLeaderboardEntry[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  return getMostReviewedBooksWithDateFilter(startDate, limit, offset);
}

export function getLast365DaysMostReviewedBooks(
  limit = 10,
  offset = 0
): Promise<BookLeaderboardEntry[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);
  return getMostReviewedBooksWithDateFilter(startDate, limit, offset);
}

export async function getStats() {
  const [booksCount, reviewsCount, reviewersCount] = await Promise.all([
    prisma.book.count(),
    prisma.review.count(),
    prisma.review.groupBy({
      by: ['telegramUserId'],
    }).then(results => results.length),
  ]);

  return {
    booksCount,
    reviewsCount,
    reviewersCount,
  };
}

export async function getRandomReviews(limit = 5) {
  // Get total count
  const totalCount = await prisma.review.count({
    where: {
      bookId: { not: null },
    },
  });

  if (totalCount === 0) {
    return [];
  }

  // Generate random offsets
  const randomOffsets = Array.from({ length: Math.min(limit, totalCount) }, () =>
    Math.floor(Math.random() * totalCount)
  );

  // Fetch reviews at random offsets
  const reviews = await Promise.all(
    randomOffsets.map(offset =>
      prisma.review.findMany({
        where: {
          bookId: { not: null },
        },
        include: {
          book: true,
        },
        take: 1,
        skip: offset,
      })
    )
  );

  return reviews.flat();
}

export async function getRecentReviews(limit = 20, offset = 0) {
  return prisma.review.findMany({
    include: {
      book: true,
    },
    orderBy: {
      reviewedAt: 'desc',
    },
    take: limit,
    skip: offset,
  });
}

export interface UpdateReviewInput {
  reviewText?: string;
  sentiment?: Sentiment;
  bookId?: number;
}

/**
 * Update a review (text, sentiment, or book assignment)
 * Returns updated review with book details
 */
export async function updateReview(
  reviewId: number,
  input: UpdateReviewInput
) {
  const updateData: any = {};

  if (input.reviewText !== undefined) {
    updateData.reviewText = input.reviewText;
  }

  if (input.sentiment !== undefined) {
    updateData.sentiment = input.sentiment;
  }

  if (input.bookId !== undefined) {
    updateData.bookId = input.bookId;
  }

  return prisma.review.update({
    where: { id: reviewId },
    data: updateData,
    include: { book: true },
  });
}

/**
 * Delete a review
 * Returns the deleted review with book details for admin notification
 */
export async function deleteReview(reviewId: number) {
  return prisma.review.delete({
    where: { id: reviewId },
    include: { book: true },
  });
}

/**
 * Check if a review belongs to a user (for authorization)
 */
export async function isReviewOwner(
  reviewId: number,
  telegramUserId: bigint
): Promise<boolean> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { telegramUserId: true },
  });

  return review?.telegramUserId === telegramUserId;
}

/**
 * Check if a user is an admin
 */
export function isAdmin(telegramUserId: bigint): boolean {
  return config.adminUserIds.includes(telegramUserId);
}

/**
 * Find orphaned books (books with no reviews) and delete them
 * Returns count of deleted books
 */
export async function cleanupOrphanBooks(): Promise<number> {
  // Find books with zero reviews
  const orphanBooks = await prisma.book.findMany({
    where: {
      reviews: {
        none: {},
      },
    },
    select: { id: true },
  });

  if (orphanBooks.length === 0) {
    return 0;
  }

  // Delete orphan books
  const result = await prisma.book.deleteMany({
    where: {
      id: {
        in: orphanBooks.map((b) => b.id),
      },
    },
  });

  return result.count;
}
