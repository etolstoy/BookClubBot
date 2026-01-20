import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Context } from "telegraf";
import {
  storeConfirmationState,
  getConfirmationState,
  clearConfirmationState,
  cleanupStaleStates,
  handleBookSelected,
  handleCancel,
  handleTextInput,
} from "../../src/bot/handlers/book-confirmation.js";
import type { BookConfirmationState } from "../../src/bot/types/confirmation-state.js";

/**
 * Helper to create mock Telegraf context
 */
function createMockContext(userId: string, messageId: number = 1, chatId: number = 1): Partial<Context> {
  return {
    callbackQuery: {
      id: "callback-1",
      from: {
        id: parseInt(userId),
        is_bot: false,
        first_name: "Test User",
      },
      chat_instance: "test",
      message: {
        message_id: messageId,
        date: Date.now() / 1000,
        chat: {
          id: chatId,
          type: "group" as const,
        },
      },
      data: "",
    },
    message: {
      message_id: messageId,
      date: Date.now() / 1000,
      chat: {
        id: chatId,
        type: "group" as const,
      },
      from: {
        id: parseInt(userId),
        is_bot: false,
        first_name: "Test User",
      },
      text: "",
    },
    chat: {
      id: chatId,
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

/**
 * Helper to create a base confirmation state
 */
function createBaseState(overrides?: Partial<BookConfirmationState>): BookConfirmationState {
  return {
    reviewData: {
      telegramUserId: BigInt(123456),
      telegramUsername: "testuser",
      telegramDisplayName: "Test User",
      reviewText: "Great book! #рецензия",
      messageId: BigInt(1),
      chatId: BigInt(1),
      reviewedAt: new Date(),
    },
    extractedInfo: {
      title: "Test Book",
      author: "Test Author",
      confidence: "high",
    },
    enrichmentResults: {
      source: "external",
      matches: [
        {
          title: "Test Book",
          author: "Test Author",
          isbn: "978-0-123456-78-9",
          coverUrl: "https://example.com/cover.jpg",
          googleBooksId: "test-id-1",
          source: "external",
          similarity: {
            title: 0.95,
            author: 0.95,
          },
        },
        {
          title: "Test Book 2",
          author: "Test Author 2",
          isbn: "978-0-123456-79-0",
          coverUrl: "https://example.com/cover2.jpg",
          googleBooksId: "test-id-2",
          source: "external",
          similarity: {
            title: 0.90,
            author: 0.90,
          },
        },
      ],
    },
    state: "showing_options",
    statusMessageId: 100,
    tempData: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe("State Management - Confirmation Flow", () => {
  beforeEach(() => {
    // Clear all states before each test
    const userIds = ["123", "456", "789"];
    userIds.forEach((id) => clearConfirmationState(id));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("User selects first option", async () => {
    const userId = "123";
    const ctx = createMockContext(userId) as Context;

    // Setup: Store state with 2 book options
    const state = createBaseState();
    storeConfirmationState(userId, state);

    // Mock callback query data for first book selection
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:0";
    }

    // Act: User selects first book
    await handleBookSelected(ctx);

    // Assert: State should be cleared after successful selection
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();

    // Assert: User received success message
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("✅ Создаю рецензию...");
  });

  it("User selects second option", async () => {
    const userId = "124";
    const ctx = createMockContext(userId) as Context;

    // Setup: Store state with 2 book options
    const state = createBaseState();
    storeConfirmationState(userId, state);

    // Mock callback query data for second book selection
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:1";
    }

    // Act: User selects second book
    await handleBookSelected(ctx);

    // Assert: State should be cleared after successful selection
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();

    // Assert: User received success message
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("✅ Создаю рецензию...");
  });

  it("User cancels confirmation", async () => {
    const userId = "125";
    const ctx = createMockContext(userId) as Context;

    // Setup: Store state
    const state = createBaseState();
    storeConfirmationState(userId, state);

    // Verify state exists
    expect(getConfirmationState(userId)).not.toBeNull();

    // Act: User cancels
    await handleCancel(ctx);

    // Assert: State should be cleared
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();

    // Assert: User received cancellation message
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("❌ Отменено");
  });

  it("State timeout after 15 minutes", () => {
    const userId = "126";

    // Setup: Create state with timestamp 16 minutes ago
    const oldDate = new Date(Date.now() - 16 * 60 * 1000);
    const state = createBaseState({ createdAt: oldDate });
    storeConfirmationState(userId, state);

    // Verify state exists before cleanup
    expect(getConfirmationState(userId)).not.toBeNull();

    // Act: Run cleanup (simulates scheduled cleanup task)
    cleanupStaleStates();

    // Assert: Stale state should be removed
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();
  });

  it("Prevent overlapping confirmations (same user)", () => {
    const userId = "127";

    // Setup: Store initial state
    const state1 = createBaseState();
    storeConfirmationState(userId, state1);

    // Attempt to store another state for the same user
    const state2 = createBaseState({
      extractedInfo: {
        title: "Different Book",
        author: "Different Author",
        confidence: "high",
      },
    });
    storeConfirmationState(userId, state2);

    // Assert: Second state should overwrite the first (Map behavior)
    const finalState = getConfirmationState(userId);
    expect(finalState).not.toBeNull();
    expect(finalState?.extractedInfo?.title).toBe("Different Book");
  });

  it("Multiple users concurrent confirmations (allowed)", () => {
    const user1 = "128";
    const user2 = "129";

    // Setup: Store states for two different users
    const state1 = createBaseState({
      reviewData: {
        telegramUserId: BigInt(128),
        telegramUsername: "user1",
        telegramDisplayName: "User 1",
        reviewText: "Review 1 #рецензия",
        messageId: BigInt(1),
        chatId: BigInt(1),
        reviewedAt: new Date(),
      },
    });
    const state2 = createBaseState({
      reviewData: {
        telegramUserId: BigInt(129),
        telegramUsername: "user2",
        telegramDisplayName: "User 2",
        reviewText: "Review 2 #рецензия",
        messageId: BigInt(2),
        chatId: BigInt(1),
        reviewedAt: new Date(),
      },
    });

    storeConfirmationState(user1, state1);
    storeConfirmationState(user2, state2);

    // Assert: Both states should exist independently
    const finalState1 = getConfirmationState(user1);
    const finalState2 = getConfirmationState(user2);

    expect(finalState1).not.toBeNull();
    expect(finalState2).not.toBeNull();
    expect(finalState1?.reviewData.telegramUserId).toBe(BigInt(128));
    expect(finalState2?.reviewData.telegramUserId).toBe(BigInt(129));
  });

  it("State cleanup on completion", async () => {
    const userId = "130";
    const ctx = createMockContext(userId) as Context;

    // Setup: Store state
    const state = createBaseState();
    storeConfirmationState(userId, state);

    // Mock callback query data for book selection
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:0";
    }

    // Verify state exists before completion
    expect(getConfirmationState(userId)).not.toBeNull();

    // Act: Complete the confirmation flow
    await handleBookSelected(ctx);

    // Assert: State should be cleared
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();
  });

  it("State cleanup on cancellation", async () => {
    const userId = "131";
    const ctx = createMockContext(userId) as Context;

    // Setup: Store state
    const state = createBaseState();
    storeConfirmationState(userId, state);

    // Verify state exists before cancellation
    expect(getConfirmationState(userId)).not.toBeNull();

    // Act: Cancel the confirmation
    await handleCancel(ctx);

    // Assert: State should be cleared
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();
  });

  it("Invalid option selection", async () => {
    const userId = "132";
    const ctx = createMockContext(userId) as Context;

    // Setup: Store state with 2 book options
    const state = createBaseState();
    storeConfirmationState(userId, state);

    // Mock callback query data for invalid book index (only 0 and 1 exist)
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:5";
    }

    // Act: User selects invalid option
    await handleBookSelected(ctx);

    // Assert: User receives error message
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("❌ Книга не найдена");

    // Assert: State should still exist (not cleared on error)
    const finalState = getConfirmationState(userId);
    expect(finalState).not.toBeNull();
  });

  it("State persistence across messages", async () => {
    const userId = "133";

    // Setup: Store initial state for ISBN entry flow
    const initialState = createBaseState({
      state: "awaiting_isbn",
    });
    storeConfirmationState(userId, initialState);

    // Simulate user sending ISBN as a text message
    const ctx1 = createMockContext(userId, 1) as Context;
    if (ctx1.message && "text" in ctx1.message) {
      ctx1.message.text = "978-0-7475-3269-9"; // Valid ISBN format
    }

    // Act: Handle first text input (ISBN)
    const handled = await handleTextInput(ctx1);

    // Assert: Message was handled by confirmation flow
    expect(handled).toBe(true);

    // Assert: State should persist (or be updated, not cleared)
    const midState = getConfirmationState(userId);
    expect(midState).not.toBeNull();

    // Note: State will either persist with updated enrichment results
    // or be cleared if the flow completes. In this case, it should show
    // new options with the enriched book from ISBN.
    expect(midState?.state).toBe("showing_options");
  });
});
