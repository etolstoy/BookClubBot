/**
 * Test helpers for Telegram reaction API
 */

import { vi } from "vitest";
import type { Context } from "telegraf";

export type ReactionEmoji = "👀" | "👍" | "👎";

interface ReactionCall {
  chatId: number | string;
  messageId: number;
  emoji: ReactionEmoji;
}

/**
 * Mock successful reaction API calls
 */
export function mockReactionSuccess(ctx: Partial<Context>) {
  const mockSetMessageReaction = vi.fn().mockResolvedValue(true);

  if (!ctx.telegram) {
    ctx.telegram = {} as any;
  }

  (ctx.telegram as any).setMessageReaction = mockSetMessageReaction;

  return mockSetMessageReaction;
}

/**
 * Mock reaction API failure
 */
export function mockReactionFailure(ctx: Partial<Context>, error?: Error) {
  const mockSetMessageReaction = vi
    .fn()
    .mockRejectedValue(error || new Error("Reaction API failed"));

  if (!ctx.telegram) {
    ctx.telegram = {} as any;
  }

  (ctx.telegram as any).setMessageReaction = mockSetMessageReaction;

  return mockSetMessageReaction;
}

/**
 * Extract reaction calls from mock
 */
export function getReactionCalls(mockFn: any): ReactionCall[] {
  return mockFn.mock.calls.map((call: any[]) => ({
    chatId: call[0],
    messageId: call[1],
    emoji: call[2]?.[0]?.emoji || call[2],
  }));
}

/**
 * Assert that a specific reaction was added
 */
export function assertReaction(
  mockFn: any,
  chatId: number | string,
  messageId: number,
  emoji: ReactionEmoji
) {
  const calls = getReactionCalls(mockFn);
  const found = calls.find(
    (call) =>
      call.chatId === chatId &&
      call.messageId === messageId &&
      call.emoji === emoji
  );

  if (!found) {
    throw new Error(
      `Expected reaction ${emoji} for message ${messageId} in chat ${chatId}, but not found. Calls: ${JSON.stringify(calls)}`
    );
  }
}

/**
 * Assert reaction was called with correct format
 */
export function assertReactionFormat(mockFn: any, expectedCount?: number) {
  const calls = mockFn.mock.calls;

  if (expectedCount !== undefined && calls.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} reaction calls, got ${calls.length}`
    );
  }

  calls.forEach((call: any[], index: number) => {
    if (typeof call[0] !== "number" && typeof call[0] !== "string") {
      throw new Error(
        `Call ${index}: chatId must be number or string, got ${typeof call[0]}`
      );
    }
    if (typeof call[1] !== "number") {
      throw new Error(
        `Call ${index}: messageId must be number, got ${typeof call[1]}`
      );
    }
    // Reaction parameter is array with {type: "emoji", emoji: "👀"}
    const reactionObj = call[2]?.[0];
    if (!reactionObj || reactionObj.type !== "emoji") {
      throw new Error(
        `Call ${index}: reaction must have type "emoji", got ${reactionObj?.type}`
      );
    }
    const emoji = reactionObj.emoji;
    if (!["👀", "👍", "👎"].includes(emoji)) {
      throw new Error(
        `Call ${index}: emoji must be 👀, 👍, or 👎, got ${emoji}`
      );
    }
  });
}
