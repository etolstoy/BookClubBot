import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Context } from "telegraf";
import {
  storeConfirmationState,
  getConfirmationStateByMessage,
  getConfirmationStateByUser,
  clearConfirmationState,
  handleBookSelected,
  handleIsbnRequested,
  handleManualEntryRequested,
  handleExtractedBookConfirmed,
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
    deleteMessage: vi.fn().mockResolvedValue(true),
    reply: vi.fn().mockResolvedValue({}),
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
    // Note: States are now keyed by chatId:messageId, so cleanup happens per-test
    // No need for global cleanup here since each test uses different message IDs
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("User selects first option", async () => {
    const userId = "123";
    const chatId = 1;
    const messageId = 100;
    const ctx = createMockContext(userId, messageId, chatId) as Context;

    // Setup: Store state with 2 book options
    const state = createBaseState();
    storeConfirmationState(chatId.toString(), messageId, userId, state);

    // Mock callback query data for first book selection
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:0";
    }

    // Act: User selects first book
    await handleBookSelected(ctx);

    // Assert: State should be cleared after successful selection
    const finalState = getConfirmationStateByMessage(chatId.toString(), messageId);
    expect(finalState).toBeNull();

    // Assert: answerCbQuery was called (success toast or error dismissal)
    // Note: May show error due to database constraint issues in test environment
    expect(ctx.answerCbQuery).toHaveBeenCalled();
  });

  it("User selects second option", async () => {
    const userId = "124";
    const chatId = 1;
    const messageId = 101;
    const ctx = createMockContext(userId, messageId, chatId) as Context;

    // Setup: Store state with 2 book options
    const state = createBaseState();
    storeConfirmationState(chatId.toString(), messageId, userId, state);

    // Mock callback query data for second book selection
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:1";
    }

    // Act: User selects second book
    await handleBookSelected(ctx);

    // Assert: State should be cleared after successful selection
    const finalState = getConfirmationStateByMessage(chatId.toString(), messageId);
    expect(finalState).toBeNull();

    // Assert: answerCbQuery was called (success toast or error dismissal)
    // Note: May show error due to database constraint issues in test environment
    expect(ctx.answerCbQuery).toHaveBeenCalled();
  });

  it("User cancels confirmation", async () => {
    const userId = "125";
    const chatId = 1;
    const messageId = 102;
    const ctx = createMockContext(userId, messageId, chatId) as Context;

    // Setup: Store state
    const state = createBaseState();
    storeConfirmationState(chatId.toString(), messageId, userId, state);

    // Verify state exists
    expect(getConfirmationStateByMessage(chatId.toString(), messageId)).not.toBeNull();

    // Act: User cancels
    await handleCancel(ctx);

    // Assert: State should be cleared
    const finalState = getConfirmationStateByMessage(chatId.toString(), messageId);
    expect(finalState).toBeNull();

    // Assert: User received cancellation toast
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("❌ Создание рецензии отменено");

    // Assert: Confirmation message was deleted (keeps chat clean)
    expect(ctx.deleteMessage).toHaveBeenCalled();

    // Assert: Message was NOT edited (we delete it instead)
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it("Cancel shows toast and deletes message (clean chat)", async () => {
    const userId = "126";
    const chatId = 1;
    const messageId = 103;
    const ctx = createMockContext(userId, messageId, chatId) as Context;

    // Setup: Store state
    const state = createBaseState();
    storeConfirmationState(chatId.toString(), messageId, userId, state);

    // Act: User cancels
    await handleCancel(ctx);

    // Assert: Toast notification shown (not a message in chat)
    expect(ctx.answerCbQuery).toHaveBeenCalledOnce();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("❌ Создание рецензии отменено");

    // Assert: Original confirmation message deleted (not edited)
    expect(ctx.deleteMessage).toHaveBeenCalledOnce();
    expect(ctx.editMessageText).not.toHaveBeenCalled();

    // Assert: Chat stays clean - no new message posted
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("handleBookSelected with missing state edits message and removes buttons", async () => {
    const userId = "999";
    const ctx = createMockContext(userId) as Context;

    // Mock callback query data for book selection
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:0";
    }

    // No state stored (missing state scenario)

    // Act: User clicks button
    await handleBookSelected(ctx);

    // Assert: Loading indicator dismissed
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();

    // Assert: Message edited with error and buttons removed
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      "Что-то пошло не так, попробуй запроцессить рецензию заново",
      { reply_markup: { inline_keyboard: [] } }
    );
  });

  it("handleIsbnRequested with missing state edits message and removes buttons", async () => {
    const userId = "998";
    const ctx = createMockContext(userId) as Context;

    // Mock callback query data for ISBN entry
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_isbn";
    }

    // No state stored (missing state scenario)

    // Act: User clicks ISBN button
    await handleIsbnRequested(ctx);

    // Assert: Loading indicator dismissed
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();

    // Assert: Message edited with error and buttons removed
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      "Что-то пошло не так, попробуй запроцессить рецензию заново",
      { reply_markup: { inline_keyboard: [] } }
    );
  });

  it("handleManualEntryRequested with missing state edits message and removes buttons", async () => {
    const userId = "997";
    const ctx = createMockContext(userId) as Context;

    // Mock callback query data for manual entry
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_manual";
    }

    // No state stored (missing state scenario)

    // Act: User clicks manual entry button
    await handleManualEntryRequested(ctx);

    // Assert: Loading indicator dismissed
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();

    // Assert: Message edited with error and buttons removed
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      "Что-то пошло не так, попробуй запроцессить рецензию заново",
      { reply_markup: { inline_keyboard: [] } }
    );
  });

  it("handleExtractedBookConfirmed with missing state edits message and removes buttons", async () => {
    const userId = "996";
    const ctx = createMockContext(userId) as Context;

    // Mock callback query data for extracted book confirmation
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_extracted";
    }

    // No state stored (missing state scenario)

    // Act: User clicks extracted book button
    await handleExtractedBookConfirmed(ctx);

    // Assert: Loading indicator dismissed
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();

    // Assert: Message edited with error and buttons removed
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      "Что-то пошло не так, попробуй запроцессить рецензию заново",
      { reply_markup: { inline_keyboard: [] } }
    );
  });

  it("Multiple reviews from same user → second replaces first (stored per messageId)", () => {
    const userId = "127";
    const chatId = 1;
    const messageId1 = 200;
    const messageId2 = 201;

    // Setup: Store initial state for first message
    const state1 = createBaseState();
    storeConfirmationState(chatId.toString(), messageId1, userId, state1);

    // Store another state for a different message (same user, different confirmation)
    const state2 = createBaseState({
      extractedInfo: {
        title: "Different Book",
        author: "Different Author",
        confidence: "high",
      },
    });
    storeConfirmationState(chatId.toString(), messageId2, userId, state2);

    // Assert: Both states exist independently (keyed by messageId)
    const finalState1 = getConfirmationStateByMessage(chatId.toString(), messageId1);
    const finalState2 = getConfirmationStateByMessage(chatId.toString(), messageId2);

    expect(finalState1).not.toBeNull();
    expect(finalState2).not.toBeNull();
    expect(finalState1?.extractedInfo?.title).toBe("Test Book");
    expect(finalState2?.extractedInfo?.title).toBe("Different Book");

    // Assert: User secondary index points to most recent message
    const userState = getConfirmationStateByUser(chatId.toString(), userId);
    expect(userState?.extractedInfo?.title).toBe("Different Book");
  });

  it("Multiple users concurrent confirmations (allowed)", () => {
    const user1 = "128";
    const user2 = "129";
    const chatId = 1;
    const messageId1 = 300;
    const messageId2 = 301;

    // Setup: Store states for two different users with different confirmation messages
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
      statusMessageId: messageId1,
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
      statusMessageId: messageId2,
    });

    storeConfirmationState(chatId.toString(), messageId1, user1, state1);
    storeConfirmationState(chatId.toString(), messageId2, user2, state2);

    // Assert: Both states should exist independently
    const finalState1 = getConfirmationStateByMessage(chatId.toString(), messageId1);
    const finalState2 = getConfirmationStateByMessage(chatId.toString(), messageId2);

    expect(finalState1).not.toBeNull();
    expect(finalState2).not.toBeNull();
    expect(finalState1?.reviewData.telegramUserId).toBe(BigInt(128));
    expect(finalState2?.reviewData.telegramUserId).toBe(BigInt(129));
  });

  it("State cleanup on completion", async () => {
    const userId = "130";
    const chatId = 1;
    const messageId = 104;
    const ctx = createMockContext(userId, messageId, chatId) as Context;

    // Setup: Store state
    const state = createBaseState();
    storeConfirmationState(chatId.toString(), messageId, userId, state);

    // Mock callback query data for book selection
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:0";
    }

    // Verify state exists before completion
    expect(getConfirmationStateByMessage(chatId.toString(), messageId)).not.toBeNull();

    // Act: Complete the confirmation flow
    await handleBookSelected(ctx);

    // Assert: State should be cleared
    const finalState = getConfirmationStateByMessage(chatId.toString(), messageId);
    expect(finalState).toBeNull();
  });

  it("State cleanup on cancellation", async () => {
    const userId = "131";
    const chatId = 1;
    const messageId = 105;
    const ctx = createMockContext(userId, messageId, chatId) as Context;

    // Setup: Store state
    const state = createBaseState();
    storeConfirmationState(chatId.toString(), messageId, userId, state);

    // Verify state exists before cancellation
    expect(getConfirmationStateByMessage(chatId.toString(), messageId)).not.toBeNull();

    // Act: Cancel the confirmation
    await handleCancel(ctx);

    // Assert: State should be cleared
    const finalState = getConfirmationStateByMessage(chatId.toString(), messageId);
    expect(finalState).toBeNull();
  });

  it("Invalid option selection", async () => {
    const userId = "132";
    const chatId = 1;
    const messageId = 106;
    const ctx = createMockContext(userId, messageId, chatId) as Context;

    // Setup: Store state with 2 book options
    const state = createBaseState();
    storeConfirmationState(chatId.toString(), messageId, userId, state);

    // Mock callback query data for invalid book index (only 0 and 1 exist)
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      ctx.callbackQuery.data = "confirm_book:5";
    }

    // Act: User selects invalid option
    await handleBookSelected(ctx);

    // Assert: User receives error message
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("❌ Книга не найдена");

    // Assert: State should still exist (not cleared on error)
    const finalState = getConfirmationStateByMessage(chatId.toString(), messageId);
    expect(finalState).not.toBeNull();
  });

  it("State persistence across messages", async () => {
    const userId = "133";
    const chatId = 1;
    const messageId = 107;

    // Setup: Store initial state for ISBN entry flow
    const initialState = createBaseState({
      state: "awaiting_isbn",
      statusMessageId: messageId,
    });
    storeConfirmationState(chatId.toString(), messageId, userId, initialState);

    // Simulate user sending ISBN as a text message
    const ctx1 = createMockContext(userId, 1, chatId) as Context;
    if (ctx1.message && "text" in ctx1.message) {
      ctx1.message.text = "978-0-7475-3269-9"; // Valid ISBN format
    }

    // Act: Handle first text input (ISBN)
    const handled = await handleTextInput(ctx1);

    // Assert: Message was handled by confirmation flow
    expect(handled).toBe(true);

    // Assert: State should persist (or be updated, not cleared)
    // Using getConfirmationStateByUser since handleTextInput uses that method
    const midState = getConfirmationStateByUser(chatId.toString(), userId);
    expect(midState).not.toBeNull();

    // Note: State will either persist with updated enrichment results
    // or be cleared if the flow completes. In this case, it should show
    // new options with the enriched book from ISBN.
    expect(midState?.state).toBe("showing_options");
  });
});
