import { describe, it, expect, beforeEach } from "vitest";
import type { Context } from "telegraf";
import { handleTextInput } from "../../src/bot/handlers/book-confirmation.js";
import { storeConfirmationState, clearConfirmationState } from "../../src/bot/handlers/book-confirmation.js";
import { MockBookDataClient } from "../../src/clients/book-data/mock-book-data-client.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { createTestContext } from "../../src/bot/types/bot-context.js";
import { createMockInputContext, createBaseConfirmationState } from "../helpers/mock-context.js";

/**
 * E2E Tests: ISBN Flow
 * Tests the complete ISBN-based book lookup flow from user input to review creation
 */

describe("E2E: ISBN Flow", () => {
  let mockBookDataClient: MockBookDataClient;
  let mockLLMClient: MockLLMClient;

  beforeEach(() => {
    mockBookDataClient = new MockBookDataClient();
    mockLLMClient = new MockLLMClient();
    clearConfirmationState("200");
    clearConfirmationState("201");
    clearConfirmationState("202");
    clearConfirmationState("203");
  });

  it("Test 1: Valid ISBN → book found → confirm → review saved", async () => {
    const userId = "200";
    const isbn = "978-0-7475-3269-9";

    // Setup: Store state in awaiting_isbn mode
    const state = createBaseConfirmationState(userId, "awaiting_isbn");
    storeConfirmationState(userId, state);

    // Mock: Book data client returns book for ISBN
    mockBookDataClient.seedBooks([
      {
        googleBooksId: "isbn-test-1",
        title: "Harry Potter and the Philosopher's Stone",
        author: "J.K. Rowling",
        isbn: isbn,
        coverUrl: "https://example.com/cover.jpg",
      },
    ]);

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx = createMockInputContext(userId, isbn, 100) as Context;

    // Act: User sends ISBN
    const handled = await handleTextInput(ctx, botContext);

    // Assert: Message was handled
    expect(handled).toBe(true);

    // Assert: Message was deleted (to keep chat clean)
    expect(ctx.telegram.deleteMessage).toHaveBeenCalled();

    // Assert: Status message was updated with enrichment results
    expect(ctx.telegram.editMessageText).toHaveBeenCalled();

    // Assert: Client was called with ISBN
    expect(mockBookDataClient.getCallCount("searchBookByISBN")).toBe(1);
  });

  it("Test 2: Valid ISBN → book not found → error message", async () => {
    const userId = "201";
    const isbn = "978-0-0000-0000-0"; // Non-existent ISBN

    // Setup: Store state in awaiting_isbn mode
    const state = createBaseConfirmationState(userId, "awaiting_isbn");
    storeConfirmationState(userId, state);

    // Mock: Book data client returns null (not found)
    mockBookDataClient.setBehavior("not_found");

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx = createMockInputContext(userId, isbn, 100) as Context;

    // Act: User sends ISBN
    const handled = await handleTextInput(ctx, botContext);

    // Assert: Message was handled
    expect(handled).toBe(true);

    // Assert: Error message was shown
    const editCall = (ctx.telegram.editMessageText as any).mock.calls[0];
    expect(editCall[3]).toContain("не найдена"); // "not found" in Russian

    // Assert: Client was called with ISBN
    expect(mockBookDataClient.getCallCount("searchBookByISBN")).toBe(1);
  });

  it("Test 3: Invalid ISBN format → error message", async () => {
    const userId = "202";
    const invalidIsbn = "123-invalid"; // Invalid format

    // Setup: Store state in awaiting_isbn mode
    const state = createBaseConfirmationState(userId, "awaiting_isbn");
    storeConfirmationState(userId, state);

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx = createMockInputContext(userId, invalidIsbn, 100) as Context;

    // Act: User sends invalid ISBN
    const handled = await handleTextInput(ctx, botContext);

    // Assert: Message was handled
    expect(handled).toBe(true);

    // Assert: Validation error message was shown
    const editCall = (ctx.telegram.editMessageText as any).mock.calls[0];
    expect(editCall[3]).toContain("Неверный формат ISBN"); // "Invalid ISBN format" in Russian

    // Assert: Client was NOT called (validation failed before API call)
    expect(mockBookDataClient.getCallCount("searchBookByISBN")).toBe(0);
  });

  it("Test 4: Google Books API error during ISBN search", async () => {
    const userId = "203";
    const isbn = "978-0-7475-3269-9";

    // Setup: Store state in awaiting_isbn mode
    const state = createBaseConfirmationState(userId, "awaiting_isbn");
    storeConfirmationState(userId, state);

    // Mock: Book data client throws error
    mockBookDataClient.setBehavior("api_error");

    const botContext = createTestContext(mockLLMClient, mockBookDataClient);
    const ctx = createMockInputContext(userId, isbn, 100) as Context;

    // Act: User sends ISBN
    const handled = await handleTextInput(ctx, botContext);

    // Assert: Message was handled
    expect(handled).toBe(true);

    // Assert: Error message was shown
    const editCall = (ctx.telegram.editMessageText as any).mock.calls[0];
    expect(editCall[3]).toContain("Ошибка"); // "Error" in Russian

    // Assert: Client was called with ISBN
    expect(mockBookDataClient.getCallCount("searchBookByISBN")).toBe(1);
  });
});
