/**
 * Telegram reaction service
 * Handles adding emoji reactions to messages
 */

import { sendErrorNotification } from "./notification.service.js";

export type ReactionEmoji = "👀" | "✅" | "❌";

/**
 * Add emoji reaction to a Telegram message
 * Non-blocking: failures are logged but don't throw
 *
 * @param telegram - Telegram API client
 * @param chatId - Chat ID (number or BigInt)
 * @param messageId - Message ID
 * @param emoji - Reaction emoji (👀, ✅, or ❌)
 */
export async function addReaction(
  telegram: any,
  chatId: number | bigint | string,
  messageId: number,
  emoji: ReactionEmoji
): Promise<void> {
  try {
    // Convert BigInt to string if needed (Telegram API accepts both)
    const chatIdValue =
      typeof chatId === "bigint" ? chatId.toString() : chatId;

    // Add reaction using Telegram API
    // Format: array of reaction objects with type and is_big flag
    await telegram.setMessageReaction(
      chatIdValue as any,
      messageId,
      [
        {
          type: emoji,
          is_big: false,
        } as any,
      ]
    );
  } catch (error) {
    // Non-blocking: log error and notify admin, but don't throw
    const errorMessage = error instanceof Error ? error.message : String(error);
    await sendErrorNotification(
      new Error(`Failed to add reaction: ${errorMessage}`),
      {
        messageId: BigInt(messageId),
        additionalInfo: `chatId: ${chatId}, emoji: ${emoji}`,
      }
    );
  }
}
