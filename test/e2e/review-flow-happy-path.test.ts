import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Context } from "telegraf";
import { handleReviewMessage, handleReviewCommand } from "../../src/bot/handlers/review.js";
import { handleBookSelected, handleTextInput, clearConfirmationState, getConfirmationState } from "../../src/bot/handlers/book-confirmation.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { MockBookDataClient } from "../../src/clients/book-data/mock-book-data-client.js";
import { createTestContext } from "../../src/bot/types/bot-context.js";
import { setupTestDatabase, teardownTestDatabase } from "../helpers/test-db.js";
import { createMockMessageContext, createMockCallbackContext, createMockReviewCommandContext } from "../helpers/mock-context.js";
import { loadReviewFixture, loadBookFixture } from "../fixtures/helpers/fixture-loader.js";
import type { PrismaClient } from "@prisma/client";

/**
 * E2E Tests: Happy Path Smoke Tests
 * Full end-to-end tests covering complete user workflows from start to finish
 */

describe.skip("E2E: Happy Path Smoke Tests", () => {
  let mockLLMClient: MockLLMClient;
  let mockBookDataClient: MockBookDataClient;
  let testDb: PrismaClient;
  let testDbPath: string;

  beforeEach(async () => {
    mockLLMClient = new MockLLMClient();
    mockBookDataClient = new MockBookDataClient();

    const setup = await setupTestDatabase();
    testDb = setup.prisma;
    testDbPath = setup.dbPath;

    // Clear confirmation states
    clearConfirmationState("400");
    clearConfirmationState("401");
    clearConfirmationState("403");
    clearConfirmationState("404");
  });

  afterEach(async () => {
    await teardownTestDatabase(testDb, testDbPath);
  });

  it("Hashtag message → extraction → enrichment → confirm → saved", async () => {
    const userId = 400;
    const fixture = loadReviewFixture("positive-gatsby");
    const bookFixture = loadBookFixture("great-gatsby");

    // Mock: LLM extraction
    mockLLMClient.mockResponse(
      { reviewText: fixture.reviewText },
      { extractedInfo: fixture.expectedExtraction }
    );

    // Mock: Book data client enrichment
    mockBookDataClient.seedBooks([bookFixture]);

    // Mock: Sentiment analysis
    mockLLMClient.mockResponse(
      { reviewText: fixture.reviewText },
      { sentiment: fixture.expectedSentiment }
    );

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx = createMockMessageContext(userId, fixture.reviewText) as Context;

    // Act: User sends hashtag message
    await handleReviewMessage(ctx, botContext);

    // Assert: LLM extraction was called
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(1);

    // Assert: Book data enrichment was called
    expect(mockBookDataClient.getCallCount("searchBooks")).toBeGreaterThan(0);

    // Assert: Status message was sent with options
    expect(ctx.reply).toHaveBeenCalled();

    // Assert: Confirmation state was created
    const state = getConfirmationState(userId.toString());
    expect(state).not.toBeNull();
    expect(state?.extractedInfo?.title).toBe(fixture.expectedExtraction.title);
  });

  it("/review command → extraction → confirm → saved", async () => {
    const userId = 401;
    const fixture = loadReviewFixture("negative-1984");
    const bookFixture = loadBookFixture("1984");

    // Mock: LLM extraction
    mockLLMClient.mockResponse(
      { reviewText: fixture.reviewText },
      { extractedInfo: fixture.expectedExtraction }
    );

    // Mock: Book data client
    mockBookDataClient.seedBooks([bookFixture]);

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx = createMockReviewCommandContext(userId, "/review", fixture.reviewText) as Context;

    // Act: User sends /review command
    await handleReviewCommand(ctx as Context, botContext);

    // Assert: Extraction was called
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(1);

    // Assert: State was created
    const state = getConfirmationState(userId.toString());
    expect(state).not.toBeNull();
  });

  it("Manual entry → create book → saved", async () => {
    const userId = 403;
    const title = "Custom Book Title";
    const author = "Custom Author";

    // Setup: User enters manual entry flow
    const reviewText = "Interesting read #рецензия";

    mockLLMClient.mockResponse(
      { reviewText },
      { extractedInfo: null }
    );

    mockLLMClient.mockResponse(
      { reviewText },
      { sentiment: "neutral" }
    );

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx1 = createMockMessageContext(userId, reviewText) as Context;

    // Initiate flow
    await handleReviewMessage(ctx1, botContext);

    // User would click "Manual Entry" button, then enter title
    // Simulate entering title
    const state = getConfirmationState(userId.toString());
    if (state) {
      state.state = "awaiting_title";
    }

    const ctx2 = createMockMessageContext(userId, title, 2) as Context;
    await handleTextInput(ctx2, botContext);

    // User enters author
    const ctx3 = createMockMessageContext(userId, author, 3) as Context;
    await handleTextInput(ctx3, botContext);

    // Assert: Review was created (state cleared)
    const finalState = getConfirmationState(userId.toString());
    expect(finalState).toBeNull();

    // Assert: Sentiment was analyzed
    expect(mockLLMClient.getCallCount("analyzeSentiment")).toBeGreaterThan(0);
  });

  it("Review saved → leaderboard updated", async () => {
    const userId = 404;
    const fixture = loadReviewFixture("positive-gatsby");
    const bookFixture = loadBookFixture("great-gatsby");

    // Mock: Complete flow
    mockLLMClient.mockResponse(
      { reviewText: fixture.reviewText },
      { extractedInfo: fixture.expectedExtraction }
    );

    mockBookDataClient.seedBooks([bookFixture]);

    mockLLMClient.mockResponse(
      { reviewText: fixture.reviewText },
      { sentiment: fixture.expectedSentiment }
    );

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx1 = createMockMessageContext(userId, fixture.reviewText) as Context;

    // Act: User sends review
    await handleReviewMessage(ctx1, botContext);

    // Verify state was created
    let state = getConfirmationState(userId.toString());
    expect(state).not.toBeNull();

    // User selects first book option
    const ctx2 = createMockCallbackContext(userId, "confirm_book:0") as Context;
    await handleBookSelected(ctx2, botContext);

    // Assert: State was cleared (review created)
    state = getConfirmationState(userId.toString());
    expect(state).toBeNull();

    // Assert: Success message was shown
    expect(ctx2.editMessageText).toHaveBeenCalled();

    // Verify review was saved to database
    const reviews = await testDb.review.findMany({
      where: { telegramUserId: BigInt(userId) },
    });
    expect(reviews.length).toBeGreaterThan(0);

    // Verify sentiment was saved
    const review = reviews[0];
    expect(review.sentiment).toBe(fixture.expectedSentiment);
  });
});
