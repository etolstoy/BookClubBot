import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Context } from "telegraf";
import { handleReviewMessage } from "../../src/bot/handlers/review.js";
import {
  handleBookSelected,
  clearConfirmationState,
  getConfirmationState,
} from "../../src/bot/handlers/book-confirmation.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { MockBookDataClient } from "../../src/clients/book-data/mock-book-data-client.js";
import { createTestContext } from "../../src/bot/types/bot-context.js";
import { setupTestDatabase, teardownTestDatabase, seedTestData } from "../helpers/test-db.js";
import {
  createMockMessageContext,
  createMockCallbackContext,
} from "../helpers/mock-context.js";
import { loadReviewFixture, loadBookFixture } from "../fixtures/helpers/fixture-loader.js";
import type { PrismaClient } from "@prisma/client";

/**
 * E2E Tests: Review State Replacement
 * Tests automatic replacement of pending confirmation states when user starts new review
 */

describe("E2E: Review State Replacement", () => {
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
    clearConfirmationState("600");
    clearConfirmationState("601");
    clearConfirmationState("602");
  });

  afterEach(async () => {
    await teardownTestDatabase(testDb, testDbPath);
  });

  it("User starts new review while one pending → old state replaced automatically", async () => {
    const userId = 600;
    const fixture1 = loadReviewFixture("positive-gatsby");
    const fixture2 = loadReviewFixture("negative-1984");
    const bookFixture1 = loadBookFixture("great-gatsby");
    const bookFixture2 = loadBookFixture("1984");

    // Mock: LLM extraction for first review
    mockLLMClient.mockResponse(fixture1.reviewText, {
      extractedInfo: fixture1.expectedExtraction,
    });

    // Seed book in test database
    await seedTestData(testDb, { books: [bookFixture1] });

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);

    // Step 1: User starts first review
    const ctx1 = createMockMessageContext(userId, fixture1.reviewText, 1) as Context;
    await handleReviewMessage(ctx1, botContext);

    // Verify first state exists
    const firstState = getConfirmationState(userId.toString());
    expect(firstState).not.toBeNull();
    expect(firstState?.reviewData.reviewText).toBe(fixture1.reviewText);
    expect(firstState?.extractedInfo?.title).toBe("The Great Gatsby");
    const firstStateMessageId = firstState?.statusMessageId;

    // Mock: LLM extraction for second review
    mockLLMClient.mockResponse(fixture2.reviewText, {
      extractedInfo: fixture2.expectedExtraction,
    });

    // Seed second book in test database
    await seedTestData(testDb, { books: [bookFixture2] });

    // Step 2: User starts second review without finishing first
    const ctx2 = createMockMessageContext(userId, fixture2.reviewText, 2) as Context;
    await handleReviewMessage(ctx2, botContext);

    // Assert: Old state was replaced with new one
    const secondState = getConfirmationState(userId.toString());
    expect(secondState).not.toBeNull();
    expect(secondState?.reviewData.reviewText).toBe(fixture2.reviewText);
    expect(secondState?.extractedInfo?.title).toBe("1984");

    // Assert: No blocking message was sent
    expect(ctx2.reply).toHaveBeenCalled();
    const replyCalls = (ctx2.reply as any).mock.calls;
    const hasBlockingMessage = replyCalls.some((call: any) =>
      call[0]?.includes("незавершённая рецензия")
    );
    expect(hasBlockingMessage).toBe(false);

    // Assert: Old confirmation message was deleted
    expect(ctx2.telegram?.deleteMessage).toHaveBeenCalled();
    expect(ctx2.telegram?.deleteMessage).toHaveBeenCalledWith(
      1, // chat ID from mock context
      firstStateMessageId
    );
  });

  it("User can start second review after abandoning first", async () => {
    const userId = 601;
    const fixture1 = loadReviewFixture("positive-gatsby");
    const fixture2 = loadReviewFixture("negative-1984");

    // Mock: First review
    mockLLMClient.mockResponse(fixture1.reviewText, {
      extractedInfo: fixture1.expectedExtraction,
    });
    await seedTestData(testDb, { books: [loadBookFixture("great-gatsby")] });

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);

    // Step 1: Start first review
    const ctx1 = createMockMessageContext(userId, fixture1.reviewText, 1) as Context;
    await handleReviewMessage(ctx1, botContext);

    const firstState = getConfirmationState(userId.toString());
    expect(firstState).not.toBeNull();
    expect(firstState?.reviewData.reviewText).toBe(fixture1.reviewText);

    // Mock: Second review
    mockLLMClient.mockResponse(fixture2.reviewText, {
      extractedInfo: fixture2.expectedExtraction,
    });
    await seedTestData(testDb, { books: [loadBookFixture("1984")] });

    // Step 2: Start second review (abandoning first)
    const ctx2 = createMockMessageContext(userId, fixture2.reviewText, 2) as Context;
    await handleReviewMessage(ctx2, botContext);

    // Assert: Old state was replaced with new one
    const secondState = getConfirmationState(userId.toString());
    expect(secondState).not.toBeNull();
    expect(secondState?.reviewData.reviewText).toBe(fixture2.reviewText);

    // Assert: First review was NOT saved to DB (only confirmation state existed)
    const reviews = await testDb.review.findMany({
      where: { telegramUserId: BigInt(userId) },
    });
    expect(reviews.length).toBe(0); // No reviews completed yet
  });

  it("Multiple sequential review attempts → only last one persists", async () => {
    const userId = 602;
    const fixtureGatsby = loadReviewFixture("positive-gatsby");
    const fixture1984 = loadReviewFixture("negative-1984");
    const fixtureWar = loadReviewFixture("cyrillic-war-and-peace");

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);

    // Start review #1 (Gatsby)
    mockLLMClient.mockResponse(fixtureGatsby.reviewText, {
      extractedInfo: fixtureGatsby.expectedExtraction,
    });
    await seedTestData(testDb, { books: [loadBookFixture("great-gatsby")] });

    const ctx1 = createMockMessageContext(userId, fixtureGatsby.reviewText, 1) as Context;
    await handleReviewMessage(ctx1, botContext);

    let state = getConfirmationState(userId.toString());
    expect(state?.extractedInfo?.title).toBe("The Great Gatsby");
    expect(state?.reviewData.reviewText).toContain("Great Gatsby");

    // Start review #2 (1984) - replaces #1
    mockLLMClient.mockResponse(fixture1984.reviewText, {
      extractedInfo: fixture1984.expectedExtraction,
    });
    await seedTestData(testDb, { books: [loadBookFixture("1984")] });

    const ctx2 = createMockMessageContext(userId, fixture1984.reviewText, 2) as Context;
    await handleReviewMessage(ctx2, botContext);

    state = getConfirmationState(userId.toString());
    expect(state?.extractedInfo?.title).toBe("1984");
    expect(state?.reviewData.reviewText).toContain("1984");

    // Start review #3 (War and Peace) - replaces #2
    mockLLMClient.mockResponse(fixtureWar.reviewText, {
      extractedInfo: fixtureWar.expectedExtraction,
    });
    await seedTestData(testDb, { books: [loadBookFixture("war-and-peace")] });

    const ctx3 = createMockMessageContext(userId, fixtureWar.reviewText, 3) as Context;
    await handleReviewMessage(ctx3, botContext);

    // Verify final state has War and Peace
    state = getConfirmationState(userId.toString());
    expect(state).not.toBeNull();
    expect(state?.extractedInfo?.title).toBe("Война и мир");
    expect(state?.reviewData.reviewText).toContain("Война и мир");

    // Assert: No reviews completed yet (all were abandoned)
    const reviews = await testDb.review.findMany({
      where: { telegramUserId: BigInt(userId) },
    });
    expect(reviews.length).toBe(0); // No reviews saved, all states were just replaced
  });
});
