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
