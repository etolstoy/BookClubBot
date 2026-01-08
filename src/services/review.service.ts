import prisma from "../lib/prisma.js";
import { analyzeSentiment, type Sentiment } from "./sentiment.js";
import { processReviewText } from "./book.service.js";

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
} | null> {
  // Process the review text to extract and find/create the book
  const bookResult = await processReviewText(input.reviewText);

  if (!bookResult) {
    // Could not identify book, save review without book association
    const review = await createReview({
      ...input,
      bookId: null,
      sentiment: null,
    });

    return {
      review,
      isNewBook: false,
      reviewCount: 0,
    };
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

export async function getMonthlyLeaderboard(year: number, month: number, limit = 10) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const results = await prisma.review.groupBy({
    by: ["telegramUserId", "telegramUsername", "telegramDisplayName"],
    where: {
      reviewedAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: limit,
  });

  return results.map((r: { telegramUserId: bigint; telegramUsername: string | null; telegramDisplayName: string | null; _count: { id: number } }, index: number) => ({
    rank: index + 1,
    telegramUserId: r.telegramUserId.toString(),
    username: r.telegramUsername,
    displayName: r.telegramDisplayName,
    reviewCount: r._count.id,
  }));
}

export async function getYearlyLeaderboard(year: number, limit = 10) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const results = await prisma.review.groupBy({
    by: ["telegramUserId", "telegramUsername", "telegramDisplayName"],
    where: {
      reviewedAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: limit,
  });

  return results.map((r: { telegramUserId: bigint; telegramUsername: string | null; telegramDisplayName: string | null; _count: { id: number } }, index: number) => ({
    rank: index + 1,
    telegramUserId: r.telegramUserId.toString(),
    username: r.telegramUsername,
    displayName: r.telegramDisplayName,
    reviewCount: r._count.id,
  }));
}

export async function getMostReviewedBooks(limit = 10) {
  const results = await prisma.book.findMany({
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
  });

  return results.map((book: { id: number; title: string; author: string | null; coverUrl: string | null; _count: { reviews: number } }, index: number) => ({
    rank: index + 1,
    bookId: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    reviewCount: book._count.reviews,
  }));
}
