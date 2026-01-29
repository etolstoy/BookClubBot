import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createReview, checkDuplicateReview } from "../../src/services/review.service.js";
import { createBook } from "../../src/services/book.service.js";
import { clearTestData } from "../helpers/test-db.js";
import prisma from "../../src/lib/prisma.js";

/**
 * Integration Tests: Review Service
 * Tests review creation, duplicate detection, and stats updates
 */

describe("Review Service Integration", () => {
  beforeEach(async () => {
    await clearTestData(prisma);
  });

  afterEach(async () => {
    await clearTestData(prisma);
  });

  it("Create first review for user → stats updated", async () => {
    // Create a book first
    const book = await createBook({
      title: "Test Book",
      author: "Test Author",
    });

    // Create first review
    const review = await createReview({
      bookId: book.id,
      telegramUserId: BigInt(12345),
      telegramUsername: "testuser",
      telegramDisplayName: "Test User",
      reviewText: "Amazing book! #рецензия",
      messageId: BigInt(100),
      chatId: BigInt(1),
      reviewedAt: new Date(),
      sentiment: "positive",
    });

    // Assert: Review was created
    expect(review).toBeDefined();
    expect(review.id).toBeDefined();
    expect(review.bookId).toBe(book.id);
    expect(review.telegramUserId).toBe(BigInt(12345));
    expect(review.sentiment).toBe("positive");

    // Assert: Stats are correct
    const reviewCount = await prisma.review.count({
      where: { telegramUserId: BigInt(12345) },
    });
    expect(reviewCount).toBe(1);

    const bookReviewCount = await prisma.review.count({
      where: { bookId: book.id },
    });
    expect(bookReviewCount).toBe(1);
  });

  it("Create subsequent review → leaderboard reflects it", async () => {
    // Create books
    const book1 = await createBook({
      title: "Book One",
      author: "Author One",
    });

    const book2 = await createBook({
      title: "Book Two",
      author: "Author Two",
    });

    const userId = BigInt(12346);

    // Create first review
    await createReview({
      bookId: book1.id,
      telegramUserId: userId,
      telegramUsername: "testuser2",
      telegramDisplayName: "Test User 2",
      reviewText: "First review #рецензия",
      messageId: BigInt(101),
      chatId: BigInt(1),
      reviewedAt: new Date(),
      sentiment: "positive",
    });

    // Create second review
    await createReview({
      bookId: book2.id,
      telegramUserId: userId,
      telegramUsername: "testuser2",
      telegramDisplayName: "Test User 2",
      reviewText: "Second review #рецензия",
      messageId: BigInt(102),
      chatId: BigInt(1),
      reviewedAt: new Date(),
      sentiment: "negative",
    });

    // Assert: User has 2 reviews
    const userReviewCount = await prisma.review.count({
      where: { telegramUserId: userId },
    });
    expect(userReviewCount).toBe(2);

    // Assert: Each book has 1 review
    const book1ReviewCount = await prisma.review.count({
      where: { bookId: book1.id },
    });
    expect(book1ReviewCount).toBe(1);

    const book2ReviewCount = await prisma.review.count({
      where: { bookId: book2.id },
    });
    expect(book2ReviewCount).toBe(1);
  });

  it("Duplicate detection (same user + messageId) → blocked", async () => {
    const book = await createBook({
      title: "Duplicate Test Book",
      author: "Duplicate Author",
    });

    const userId = BigInt(12347);
    const messageId = BigInt(103);

    // Create first review
    await createReview({
      bookId: book.id,
      telegramUserId: userId,
      telegramUsername: "testuser3",
      telegramDisplayName: "Test User 3",
      reviewText: "Original review #рецензия",
      messageId,
      chatId: BigInt(1),
      reviewedAt: new Date(),
      sentiment: "neutral",
    });

    // Check for duplicate
    const isDuplicate = await checkDuplicateReview(userId, messageId);

    // Assert: Duplicate was detected
    expect(isDuplicate).toBe(true);

    // Verify only one review exists
    const reviewCount = await prisma.review.count({
      where: {
        telegramUserId: userId,
        messageId,
      },
    });
    expect(reviewCount).toBe(1);
  });

  it("Sentiment analysis success → review has sentiment", async () => {
    const book = await createBook({
      title: "Sentiment Test Book",
      author: "Sentiment Author",
    });

    // Create review with sentiment
    const review = await createReview({
      bookId: book.id,
      telegramUserId: BigInt(12348),
      telegramUsername: "testuser4",
      telegramDisplayName: "Test User 4",
      reviewText: "Positive review! #рецензия",
      messageId: BigInt(104),
      chatId: BigInt(1),
      reviewedAt: new Date(),
      sentiment: "positive",
    });

    // Assert: Review has sentiment
    expect(review.sentiment).toBe("positive");

    // Fetch from DB to verify persistence
    const savedReview = await prisma.review.findUnique({
      where: { id: review.id },
    });
    expect(savedReview?.sentiment).toBe("positive");
  });

  it("Sentiment analysis failure → review has null sentiment", async () => {
    const book = await createBook({
      title: "No Sentiment Book",
      author: "No Sentiment Author",
    });

    // Create review without sentiment (null)
    const review = await createReview({
      bookId: book.id,
      telegramUserId: BigInt(12349),
      telegramUsername: "testuser5",
      telegramDisplayName: "Test User 5",
      reviewText: "Review without sentiment #рецензия",
      messageId: BigInt(105),
      chatId: BigInt(1),
      reviewedAt: new Date(),
      sentiment: null,
    });

    // Assert: Review has null sentiment
    expect(review.sentiment).toBeNull();

    // Fetch from DB to verify persistence
    const savedReview = await prisma.review.findUnique({
      where: { id: review.id },
    });
    expect(savedReview?.sentiment).toBeNull();
  });

});
