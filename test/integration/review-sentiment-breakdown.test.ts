import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBookSentimentBreakdown } from "../../src/services/review.service.js";
import { setupTestDatabase, teardownTestDatabase } from "../helpers/test-db.js";
import type { PrismaClient } from "@prisma/client";

describe("Review Sentiment Breakdown", () => {
  let testDb: PrismaClient;
  let testDbPath: string;
  let bookId: number;

  beforeEach(async () => {
    const setup = await setupTestDatabase();
    testDb = setup.prisma;
    testDbPath = setup.dbPath;

    // Create a test book
    const book = await testDb.book.create({
      data: {
        title: "Test Book",
        author: "Test Author",
      },
    });
    bookId = book.id;
  });

  afterEach(async () => {
    await teardownTestDatabase(testDb, testDbPath);
  });

  it("should return all zeros for book with no reviews", async () => {
    const breakdown = await getBookSentimentBreakdown(bookId, testDb);

    expect(breakdown).toEqual({
      positive: 0,
      negative: 0,
      neutral: 0,
    });
  });

  it("should count single positive review", async () => {
    await testDb.review.create({
      data: {
        bookId,
        telegramUserId: BigInt(123),
        chatId: BigInt(456),
        messageId: BigInt(789),
        reviewText: "Great book!",
        sentiment: "positive",
        reviewedAt: new Date(),
      },
    });

    const breakdown = await getBookSentimentBreakdown(bookId, testDb);

    expect(breakdown).toEqual({
      positive: 1,
      negative: 0,
      neutral: 0,
    });
  });

  it("should count mixed sentiments correctly", async () => {
    // Create reviews with different sentiments
    await testDb.review.createMany({
      data: [
        {
          bookId,
          telegramUserId: BigInt(1),
          chatId: BigInt(100),
          messageId: BigInt(1001),
          reviewText: "Great!",
          sentiment: "positive",
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(2),
          chatId: BigInt(100),
          messageId: BigInt(1002),
          reviewText: "Amazing!",
          sentiment: "positive",
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(3),
          chatId: BigInt(100),
          messageId: BigInt(1003),
          reviewText: "Terrible",
          sentiment: "negative",
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(4),
          chatId: BigInt(100),
          messageId: BigInt(1004),
          reviewText: "Meh",
          sentiment: "neutral",
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(5),
          chatId: BigInt(100),
          messageId: BigInt(1005),
          reviewText: "Okay",
          sentiment: "neutral",
          reviewedAt: new Date(),
        },
      ],
    });

    const breakdown = await getBookSentimentBreakdown(bookId, testDb);

    expect(breakdown).toEqual({
      positive: 2,
      negative: 1,
      neutral: 2,
    });
  });

  it("should handle null sentiments gracefully", async () => {
    await testDb.review.createMany({
      data: [
        {
          bookId,
          telegramUserId: BigInt(1),
          chatId: BigInt(100),
          messageId: BigInt(1001),
          reviewText: "Review 1",
          sentiment: null, // Sentiment analysis failed
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(2),
          chatId: BigInt(100),
          messageId: BigInt(1002),
          reviewText: "Review 2",
          sentiment: "positive",
          reviewedAt: new Date(),
        },
      ],
    });

    const breakdown = await getBookSentimentBreakdown(bookId, testDb);

    expect(breakdown).toEqual({
      positive: 1,
      negative: 0,
      neutral: 0,
    });
  });

  it("should count only reviews for specific book", async () => {
    // Create another book
    const otherBook = await testDb.book.create({
      data: {
        title: "Other Book",
        author: "Other Author",
      },
    });

    // Create reviews for both books
    await testDb.review.createMany({
      data: [
        {
          bookId,
          telegramUserId: BigInt(1),
          chatId: BigInt(100),
          messageId: BigInt(1001),
          reviewText: "Good",
          sentiment: "positive",
          reviewedAt: new Date(),
        },
        {
          bookId: otherBook.id,
          telegramUserId: BigInt(2),
          chatId: BigInt(100),
          messageId: BigInt(1002),
          reviewText: "Bad",
          sentiment: "negative",
          reviewedAt: new Date(),
        },
      ],
    });

    const breakdown = await getBookSentimentBreakdown(bookId, testDb);

    expect(breakdown).toEqual({
      positive: 1,
      negative: 0,
      neutral: 0,
    });
  });

  it("should handle all negative reviews", async () => {
    await testDb.review.createMany({
      data: [
        {
          bookId,
          telegramUserId: BigInt(1),
          chatId: BigInt(100),
          messageId: BigInt(1001),
          reviewText: "Bad",
          sentiment: "negative",
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(2),
          chatId: BigInt(100),
          messageId: BigInt(1002),
          reviewText: "Terrible",
          sentiment: "negative",
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(3),
          chatId: BigInt(100),
          messageId: BigInt(1003),
          reviewText: "Awful",
          sentiment: "negative",
          reviewedAt: new Date(),
        },
      ],
    });

    const breakdown = await getBookSentimentBreakdown(bookId, testDb);

    expect(breakdown).toEqual({
      positive: 0,
      negative: 3,
      neutral: 0,
    });
  });

  it("should handle all neutral reviews", async () => {
    await testDb.review.createMany({
      data: [
        {
          bookId,
          telegramUserId: BigInt(1),
          chatId: BigInt(100),
          messageId: BigInt(1001),
          reviewText: "Okay",
          sentiment: "neutral",
          reviewedAt: new Date(),
        },
        {
          bookId,
          telegramUserId: BigInt(2),
          chatId: BigInt(100),
          messageId: BigInt(1002),
          reviewText: "Meh",
          sentiment: "neutral",
          reviewedAt: new Date(),
        },
      ],
    });

    const breakdown = await getBookSentimentBreakdown(bookId, testDb);

    expect(breakdown).toEqual({
      positive: 0,
      negative: 0,
      neutral: 2,
    });
  });
});
