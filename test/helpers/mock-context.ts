/**
 * Mock Telegraf Context for Testing
 * Provides minimal mock implementations of Telegraf Context
 */

import type { Context } from "telegraf";
import type { Message, User, Chat } from "telegraf/types";

/**
 * Create a mock Telegraf message
 */
export function createMockMessage(overrides: Partial<Message> = {}): Message {
  const defaultMessage: Message = {
    message_id: 123,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: -1001234567890,
      type: "group",
      title: "Test Group",
    } as Chat,
    from: {
      id: 12345678,
      is_bot: false,
      first_name: "Test",
      last_name: "User",
      username: "testuser",
    } as User,
    text: "Test message #рецензия",
    ...overrides,
  } as Message;

  return defaultMessage;
}

/**
 * Create a mock Telegraf context
 */
export function createMockContext(
  overrides: Partial<Context> = {}
): Context {
  const sentMessages: Array<{ text: string; extra?: any }> = [];
  const editedMessages: Array<{ messageId: number; text: string; extra?: any }> = [];

  const mockContext = {
    message: createMockMessage(),
    chat: {
      id: -1001234567890,
      type: "group",
    } as Chat,
    from: {
      id: 12345678,
      is_bot: false,
      first_name: "Test",
      last_name: "User",
      username: "testuser",
    } as User,
    reply: async (text: string, extra?: any) => {
      sentMessages.push({ text, extra });
      return {
        message_id: Math.floor(Math.random() * 10000),
        date: Math.floor(Date.now() / 1000),
        chat: mockContext.chat,
        text,
      } as Message;
    },
    telegram: {
      sendMessage: async (chatId: number | string, text: string, extra?: any) => {
        sentMessages.push({ text, extra });
        return {
          message_id: Math.floor(Math.random() * 10000),
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId, type: "group" },
          text,
        } as Message;
      },
      editMessageText: async (
        chatId: number | string | undefined,
        messageId: number | undefined,
        inlineMessageId: string | undefined,
        text: string,
        extra?: any
      ) => {
        if (messageId) {
          editedMessages.push({ messageId, text, extra });
        }
        return true;
      },
    },
    // Helper methods to inspect mock state
    _getSentMessages: () => sentMessages,
    _getEditedMessages: () => editedMessages,
    _clearMessages: () => {
      sentMessages.length = 0;
      editedMessages.length = 0;
    },
    ...overrides,
  } as unknown as Context & {
    _getSentMessages: () => Array<{ text: string; extra?: any }>;
    _getEditedMessages: () => Array<{ messageId: number; text: string; extra?: any }>;
    _clearMessages: () => void;
  };

  return mockContext;
}

/**
 * Create a mock context with a specific message text
 */
export function createMockContextWithText(text: string): Context {
  return createMockContext({
    message: createMockMessage({ text }),
  });
}

/**
 * Create a mock context for a reply to another message
 */
export function createMockReplyContext(
  replyToText: string,
  commandText: string = "/review"
): Context {
  const replyToMessage = createMockMessage({
    message_id: 100,
    text: replyToText,
  });

  return createMockContext({
    message: createMockMessage({
      text: commandText,
      reply_to_message: replyToMessage,
    }),
  });
}

/**
 * E2E Test Helpers
 * Simpler mock factories using vi.fn() for E2E and integration tests
 */

import { vi } from "vitest";
import type { BookConfirmationState } from "../../src/bot/types/confirmation-state.js";
import type { Message } from "telegraf/types";

/**
 * Create a simple mock message context for E2E tests
 * Uses vi.fn() for easy assertion on telegram methods
 */
export function createMockMessageContext(
  userId: number,
  text: string,
  messageId: number = 1
): Partial<Context> {
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
    reply: vi.fn().mockResolvedValue({
      message_id: Math.floor(Math.random() * 10000),
      date: Date.now() / 1000,
      chat: { id: 1, type: "group" as const },
      text: "",
    }),
  } as Partial<Context>;
}

/**
 * Create a mock callback query context for E2E tests
 * Useful for testing inline keyboard button handlers
 */
export function createMockCallbackContext(
  userId: number,
  data: string,
  statusMessageId: number = 100
): Partial<Context> {
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
        message_id: statusMessageId,
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

/**
 * Create a comprehensive mock context with both message and callback
 * Most complete version - useful for handlers that need multiple properties
 */
export function createMockInputContext(
  userId: string | number,
  text: string,
  statusMessageId: number = 100
): Partial<Context> {
  const userIdNum = typeof userId === "string" ? parseInt(userId) : userId;

  return {
    message: {
      message_id: 1,
      date: Date.now() / 1000,
      chat: {
        id: 1,
        type: "group" as const,
      },
      from: {
        id: userIdNum,
        is_bot: false,
        first_name: "Test User",
      },
      text,
    },
    chat: {
      id: 1,
      type: "group" as const,
    },
    callbackQuery: {
      id: "callback-1",
      from: {
        id: userIdNum,
        is_bot: false,
        first_name: "Test User",
      },
      chat_instance: "test",
      message: {
        message_id: statusMessageId,
        date: Date.now() / 1000,
        chat: {
          id: 1,
          type: "group" as const,
        },
      },
    },
    telegram: {
      editMessageText: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue(true),
    } as any,
    answerCbQuery: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue({}),
    deleteMessage: vi.fn().mockResolvedValue(true),
  } as Partial<Context>;
}

/**
 * Create a mock context for /review command with reply_to_message
 * Useful for testing the /review command handler
 */
export function createMockReviewCommandContext(
  userId: number,
  commandText: string,
  replyToText: string,
  replyToMessageId: number = 2
): Partial<Context> {
  return {
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
      text: commandText,
      reply_to_message: {
        message_id: replyToMessageId,
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
        text: replyToText,
      } as Message.TextMessage,
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
}

/**
 * Create a base confirmation state for testing
 * Provides sensible defaults that can be overridden
 */
export function createBaseConfirmationState(
  userId: string | number,
  state: string = "awaiting_isbn",
  overrides?: Partial<BookConfirmationState>
): BookConfirmationState {
  const userIdStr = typeof userId === "number" ? userId.toString() : userId;

  return {
    reviewData: {
      telegramUserId: BigInt(userIdStr),
      telegramUsername: "testuser",
      telegramDisplayName: "Test User",
      reviewText: "Great book! #рецензия",
      messageId: BigInt(1),
      chatId: BigInt(1),
      reviewedAt: new Date(),
    },
    extractedInfo: null,
    enrichmentResults: null,
    state: state as any,
    statusMessageId: 100,
    tempData: {},
    createdAt: new Date(),
    ...overrides,
  };
}
