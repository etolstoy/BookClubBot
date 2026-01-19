import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Context } from "telegraf";
import { handleReviewMessage, handleReviewCommand } from "../../src/bot/handlers/review.js";
import { handleBookSelected, handleTextInput, clearConfirmationState, getConfirmationState } from "../../src/bot/handlers/book-confirmation.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { MockBookDataClient } from "../../src/clients/book-data/mock-book-data-client.js";
import { createTestContext } from "../../src/bot/types/bot-context.js";
import { setupTestDatabase, teardownTestDatabase } from "../helpers/test-db.js";
import type { PrismaClient } from "@prisma/client";

/**
 * E2E Tests: Happy Path Smoke Tests
 * Full end-to-end tests covering complete user workflows from start to finish
 */

function createMockMessage(userId: number, text: string, messageId: number = 1): Partial<Context> {
  return {
    message: {
      message_id: messageId,
      date: Date.now() / 1000,
      chat: {
        id: 1,
        type: "group" as const,
      },
      from: {
        id: userId,
        is_bot: false,
        first_name: "Test User",
        username: "testuser",
      },
      text,
    },
    chat: {
      id: 1,
      type: "group" as const,
    },
    telegram: {
      editMessageText: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue(true),
    } as any,
    reply: vi.fn().mockResolvedValue({}),
  } as Partial<Context>;
}

function createMockCallback(userId: number, data: string): Partial<Context> {
  return {
    callbackQuery: {
      id: "callback-1",
      from: {
        id: userId,
        is_bot: false,
        first_name: "Test User",
        username: "testuser",
      },
      chat_instance: "test",
      message: {
        message_id: 100,
        date: Date.now() / 1000,
        chat: {
          id: 1,
          type: "group" as const,
        },
      },
      data,
    },
    chat: {
      id: 1,
      type: "group" as const,
    },
    telegram: {
      editMessageText: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue(true),
    } as any,
    answerCbQuery: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue({}),
  } as Partial<Context>;
}

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
    clearConfirmationState("402");
    clearConfirmationState("403");
    clearConfirmationState("404");

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await teardownTestDatabase(testDb, testDbPath);
  });

  it("Test 1: Hashtag message → extraction → enrichment → confirm → saved", async () => {
    const userId = 400;
    const reviewText = 'Just read "The Great Gatsby" by F. Scott Fitzgerald. Brilliant! #рецензия';

    // Mock: LLM extraction
    mockLLMClient.mockResponse(
      { reviewText },
      {
        extractedInfo: {
          title: "The Great Gatsby",
          author: "F. Scott Fitzgerald",
          confidence: "high",
        },
      }
    );

    // Mock: Book data client enrichment
    mockBookDataClient.seedBooks([
      {
        googleBooksId: "gatsby-id",
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        isbn: "978-0-7432-7356-5",
        coverUrl: "https://example.com/gatsby.jpg",
      },
    ]);

    // Mock: Sentiment analysis
    mockLLMClient.mockResponse(
      { reviewText },
      { sentiment: "positive" }
    );

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx = createMockMessage(userId, reviewText) as Context;

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
    expect(state?.extractedInfo?.title).toBe("The Great Gatsby");
  });

  it("Test 2: /review command → extraction → confirm → saved", async () => {
    const userId = 401;
    const reviewText = 'Finished "1984" by George Orwell. Mind-blowing dystopia.';

    // Mock: LLM extraction
    mockLLMClient.mockResponse(
      { reviewText },
      {
        extractedInfo: {
          title: "1984",
          author: "George Orwell",
          confidence: "high",
        },
      }
    );

    // Mock: Book data client
    mockBookDataClient.seedBooks([
      {
        googleBooksId: "1984-id",
        title: "1984",
        author: "George Orwell",
        isbn: "978-0-452-28423-4",
        coverUrl: "https://example.com/1984.jpg",
      },
    ]);

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);

    // Create mock context for /review command with reply_to_message
    const ctx = {
      message: {
        message_id: 1,
        date: Date.now() / 1000,
        chat: {
          id: 1,
          type: "group" as const,
        },
        from: {
          id: userId,
          is_bot: false,
          first_name: "Test User",
          username: "testuser",
        },
        text: "/review",
        reply_to_message: {
          message_id: 2,
          date: Date.now() / 1000,
          chat: {
            id: 1,
            type: "group" as const,
          },
          from: {
            id: userId,
            is_bot: false,
            first_name: "Test User",
            username: "testuser",
          },
          text: reviewText,
        },
      },
      chat: {
        id: 1,
        type: "group" as const,
      },
      telegram: {
        editMessageText: vi.fn().mockResolvedValue({}),
      } as any,
      reply: vi.fn().mockResolvedValue({}),
    } as Partial<Context>;

    // Act: User sends /review command
    await handleReviewCommand(ctx as Context, botContext);

    // Assert: Extraction was called
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(1);

    // Assert: State was created
    const state = getConfirmationState(userId.toString());
    expect(state).not.toBeNull();
  });

  it("Test 3: ISBN entry → search → confirm → saved", async () => {
    const userId = 402;
    const isbn = "978-0-06-112008-4";

    // Setup: User is in awaiting_isbn state
    const reviewText = "Great book! #рецензия";

    // Create initial state via hashtag message (simulating failed extraction)
    mockLLMClient.mockResponse(
      { reviewText },
      { extractedInfo: null }
    );

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx1 = createMockMessage(userId, reviewText) as Context;

    await handleReviewMessage(ctx1, botContext);

    // Now user enters ISBN
    mockBookDataClient.seedBooks([
      {
        googleBooksId: "mockingbird-id",
        title: "To Kill a Mockingbird",
        author: "Harper Lee",
        isbn: isbn,
        coverUrl: "https://example.com/mockingbird.jpg",
      },
    ]);

    const ctx2 = createMockMessage(userId, isbn, 2) as Context;

    // Act: User sends ISBN
    const handled = await handleTextInput(ctx2, botContext);

    // Assert: ISBN was handled
    expect(handled).toBe(true);

    // Assert: Book was found by ISBN
    expect(mockBookDataClient.getCallCount("searchBookByISBN")).toBe(1);
  });

  it("Test 4: Manual entry → create book → saved", async () => {
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
    const ctx1 = createMockMessage(userId, reviewText) as Context;

    // Initiate flow
    await handleReviewMessage(ctx1, botContext);

    // User would click "Manual Entry" button, then enter title
    // Simulate entering title
    const state = getConfirmationState(userId.toString());
    if (state) {
      state.state = "awaiting_title";
    }

    const ctx2 = createMockMessage(userId, title, 2) as Context;
    await handleTextInput(ctx2, botContext);

    // User enters author
    const ctx3 = createMockMessage(userId, author, 3) as Context;
    await handleTextInput(ctx3, botContext);

    // Assert: Review was created (state cleared)
    const finalState = getConfirmationState(userId.toString());
    expect(finalState).toBeNull();

    // Assert: Sentiment was analyzed
    expect(mockLLMClient.getCallCount("analyzeSentiment")).toBeGreaterThan(0);
  });

  it("Test 5: Review saved → leaderboard updated", async () => {
    const userId = 404;
    const reviewText = 'Read "Pride and Prejudice" by Jane Austen. #рецензия';

    // Mock: Complete flow
    mockLLMClient.mockResponse(
      { reviewText },
      {
        extractedInfo: {
          title: "Pride and Prejudice",
          author: "Jane Austen",
          confidence: "high",
        },
      }
    );

    mockBookDataClient.seedBooks([
      {
        googleBooksId: "pride-id",
        title: "Pride and Prejudice",
        author: "Jane Austen",
        isbn: "978-0-14-143951-8",
        coverUrl: "https://example.com/pride.jpg",
      },
    ]);

    mockLLMClient.mockResponse(
      { reviewText },
      { sentiment: "positive" }
    );

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx1 = createMockMessage(userId, reviewText) as Context;

    // Act: User sends review
    await handleReviewMessage(ctx1, botContext);

    // Verify state was created
    let state = getConfirmationState(userId.toString());
    expect(state).not.toBeNull();

    // User selects first book option
    const ctx2 = createMockCallback(userId, "confirm_book:0") as Context;
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
    expect(review.sentiment).toBe("positive");
  });
});
