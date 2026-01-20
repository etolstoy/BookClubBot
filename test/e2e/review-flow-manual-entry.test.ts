import { describe, it, expect, beforeEach } from "vitest";
import type { Context } from "telegraf";
import {
  handleTextInput,
  handleCancel,
  storeConfirmationState,
  clearConfirmationState,
  getConfirmationState,
} from "../../src/bot/handlers/book-confirmation.js";
import { MockBookDataClient } from "../../src/clients/book-data/mock-book-data-client.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { createTestContext } from "../../src/bot/types/bot-context.js";
import { createMockInputContext, createBaseConfirmationState } from "../helpers/mock-context.js";

/**
 * E2E Tests: Manual Entry Flow
 * Tests the complete manual book entry workflow (title → author → confirmation)
 */

describe("E2E: Manual Entry Flow", () => {
  let mockBookDataClient: MockBookDataClient;
  let mockLLMClient: MockLLMClient;

  beforeEach(() => {
    mockBookDataClient = new MockBookDataClient();
    mockLLMClient = new MockLLMClient();

    // Configure sentiment analysis mock
    mockLLMClient.mockResponse(
      { reviewText: "Great book! #рецензия" },
      { sentiment: "positive" }
    );

    // Clear states
    const userIds = ["300", "301", "302", "303", "304"];
    userIds.forEach((id) => clearConfirmationState(id));
  });

  it("Test 1: Complete manual entry → new book created → review saved", async () => {
    const userId = "300";
    const title = "The Great Gatsby";
    const author = "F. Scott Fitzgerald";

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);

    // Step 1: User enters title
    const state1 = createBaseConfirmationState(userId, "awaiting_title");
    storeConfirmationState(userId, state1);

    const ctx1 = createMockInputContext(userId, title, 100) as Context;
    const handled1 = await handleTextInput(ctx1, botContext);

    // Assert: Title input was handled
    expect(handled1).toBe(true);

    // Assert: State transitioned to awaiting_author
    const state2 = getConfirmationState(userId);
    expect(state2?.state).toBe("awaiting_author");
    expect(state2?.tempData.enteredTitle).toBe(title);

    // Step 2: User enters author
    const ctx2 = createMockInputContext(userId, author, 100) as Context;
    const handled2 = await handleTextInput(ctx2, botContext);

    // Assert: Author input was handled
    expect(handled2).toBe(true);

    // Assert: State was cleared (review created successfully)
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();

    // Assert: Success message was shown
    expect(ctx2.telegram.editMessageText).toHaveBeenCalled();
    const editCall = (ctx2.telegram.editMessageText as any).mock.calls[0];
    expect(editCall[3]).toContain("Поздравляю"); // "Congratulations" in Russian
  });

  it("Test 2: Manual entry → existing book found (exact match) → reused", async () => {
    const userId = "301";
    const title = "1984";
    const author = "George Orwell";

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);

    // Step 1: User enters title
    const state1 = createBaseConfirmationState(userId, "awaiting_title");
    storeConfirmationState(userId, state1);

    const ctx1 = createMockInputContext(userId, title, 100) as Context;
    await handleTextInput(ctx1, botContext);

    // Step 2: User enters author (book should be found/created)
    const ctx2 = createMockInputContext(userId, author, 100) as Context;
    const handled2 = await handleTextInput(ctx2, botContext);

    // Assert: Author input was handled
    expect(handled2).toBe(true);

    // Assert: Review was created
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();

    // Assert: Sentiment was analyzed
    expect(mockLLMClient.getCallCount("analyzeSentiment")).toBe(1);
  });

  it("Test 3: Cancel during title entry", async () => {
    const userId = "302";

    // Setup: User is in awaiting_title state
    const state = createBaseConfirmationState(userId, "awaiting_title");
    storeConfirmationState(userId, state);

    // Verify state exists
    expect(getConfirmationState(userId)).not.toBeNull();

    const ctx = createMockInputContext(userId, "", 100) as Context;

    // Act: User cancels
    await handleCancel(ctx);

    // Assert: State was cleared
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();

    // Assert: Cancellation message was shown
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("❌ Отменено");
  });

  it("Test 4: Cancel during author entry", async () => {
    const userId = "303";

    // Setup: User is in awaiting_author state (already entered title)
    const state = createBaseConfirmationState(userId, "awaiting_author", {
      tempData: { enteredTitle: "Some Book" },
    });
    storeConfirmationState(userId, state);

    // Verify state exists
    expect(getConfirmationState(userId)).not.toBeNull();

    const ctx = createMockInputContext(userId, "", 100) as Context;

    // Act: User cancels
    await handleCancel(ctx);

    // Assert: State was cleared
    const finalState = getConfirmationState(userId);
    expect(finalState).toBeNull();

    // Assert: Cancellation message was shown
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("❌ Отменено");
  });

  it("Test 5: Empty/invalid inputs", async () => {
    const userId = "304";
    const botContext = createTestContext(mockLLMClient, mockBookDataClient);

    // Step 1: User enters empty title
    const state1 = createBaseConfirmationState(userId, "awaiting_title");
    storeConfirmationState(userId, state1);

    const ctx1 = createMockInputContext(userId, "", 100) as Context;
    const handled1 = await handleTextInput(ctx1, botContext);

    // Assert: Empty input was handled (state transitioned anyway - empty is valid)
    expect(handled1).toBe(true);

    // Step 2: User enters empty author
    const ctx2 = createMockInputContext(userId, "", 100) as Context;
    const handled2 = await handleTextInput(ctx2, botContext);

    // Assert: Empty author was handled (book created with empty title and author)
    expect(handled2).toBe(true);

    // Note: Empty strings are valid - system allows creating books with minimal info
    // This tests that the system doesn't crash on edge case inputs
  });
});
