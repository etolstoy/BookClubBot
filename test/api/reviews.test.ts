import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import reviewsRouter from "../../src/api/routes/reviews.js";
import prisma from "../../src/lib/prisma.js";
import { clearTestData } from "../helpers/test-db.js";

describe.sequential("GET /api/reviews/:id", () => {
  let app: express.Application;
  let testReviewId: number;
  let testBookId: number;

  beforeEach(async () => {
    // Clear test data
    await clearTestData(prisma);

    // Seed test data
    const book = await prisma.book.create({
      data: {
        title: "Test Book",
        author: "Test Author",
        googleBooksId: "test123",
      },
    });
    testBookId = book.id;

    const review = await prisma.review.create({
      data: {
        bookId: testBookId,
        telegramUserId: BigInt(12345),
        telegramUsername: "testuser",
        telegramDisplayName: "Test User",
        reviewText: "This is a test review",
        sentiment: "positive",
        reviewedAt: new Date("2024-01-01"),
        messageId: BigInt(67890),
        chatId: BigInt(11111),
      },
    });
    testReviewId = review.id;

    // Setup Express app
    app = express();
    app.use("/api/reviews", reviewsRouter);
  });

  afterEach(async () => {
    await clearTestData(prisma);
  });

  it("should return review with book data", async () => {
    const response = await request(app).get(`/api/reviews/${testReviewId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("review");

    const review = response.body.review;
    expect(review.id).toBe(testReviewId);
    expect(review.reviewerName).toBe("Test User");
    expect(review.reviewerUsername).toBe("testuser");
    expect(review.telegramUserId).toBe("12345");
    expect(review.reviewText).toBe("This is a test review");
    expect(review.sentiment).toBe("positive");
    expect(review.reviewedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(review.messageId).toBe("67890");
    expect(review.chatId).toBe("11111");

    // Check book data
    expect(review.book).not.toBeNull();
    expect(review.book.id).toBe(testBookId);
    expect(review.book.title).toBe("Test Book");
    expect(review.book.author).toBe("Test Author");
  });

  it("should return 400 for invalid review ID", async () => {
    const response = await request(app).get("/api/reviews/invalid");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid review ID");
  });

  it("should return 404 for non-existent review", async () => {
    const response = await request(app).get("/api/reviews/99999");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Review not found");
  });

  it("should convert BigInt fields to strings", async () => {
    const response = await request(app).get(`/api/reviews/${testReviewId}`);

    expect(response.status).toBe(200);

    const review = response.body.review;
    // Verify BigInt fields are strings
    expect(typeof review.telegramUserId).toBe("string");
    expect(typeof review.messageId).toBe("string");
    expect(typeof review.chatId).toBe("string");
  });

  it("should handle review without book (null book)", async () => {
    // Create review without book
    const reviewWithoutBook = await prisma.review.create({
      data: {
        bookId: null,
        telegramUserId: BigInt(54321),
        telegramUsername: "testuser2",
        telegramDisplayName: "Test User 2",
        reviewText: "Review without book",
        sentiment: "neutral",
        reviewedAt: new Date("2024-01-02"),
      },
    });

    const response = await request(app).get(`/api/reviews/${reviewWithoutBook.id}`);

    expect(response.status).toBe(200);
    expect(response.body.review.book).toBeNull();
  });

  it("should use fallback name when display name and username are missing", async () => {
    // Create review with no username or display name
    const anonymousReview = await prisma.review.create({
      data: {
        bookId: testBookId,
        telegramUserId: BigInt(99999),
        telegramUsername: null,
        telegramDisplayName: null,
        reviewText: "Anonymous review",
        sentiment: "positive",
        reviewedAt: new Date("2024-01-03"),
      },
    });

    const response = await request(app).get(`/api/reviews/${anonymousReview.id}`);

    expect(response.status).toBe(200);
    expect(response.body.review.reviewerName).toBe("Anonymous");
  });
});
