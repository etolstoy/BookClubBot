/**
 * Telegram reaction service
 * Handles adding emoji reactions to messages
 */

import { sendErrorNotification } from "./notification.service.js";

export type ReactionEmoji = "👀" | "👍" | "👎" | "👌" | "😱";

/**
 * Add emoji reaction to a Telegram message
 * Non-blocking: failures are logged but don't throw
 *
 * Note: Not all emojis are available in all chats. Groups can configure
 * which reactions are allowed. If an emoji isn't available (REACTION_INVALID),
 * it's silently skipped (logged to console only, no admin notification).
 *
 * @param telegram - Telegram API client
 * @param chatId - Chat ID (number or BigInt)
 * @param messageId - Message ID
 * @param emoji - Reaction emoji (👀, 👍, or 👎)
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
    // Format: array of ReactionTypeEmoji objects
    // See: https://core.telegram.org/bots/api#setmessagereaction
    await telegram.setMessageReaction(
      chatIdValue as any,
      messageId,
      [
        {
          type: "emoji",
          emoji: emoji,
        } as any,
      ]
    );
  } catch (error) {
    // Non-blocking: log error and notify admin, but don't throw
    const errorMessage = error instanceof Error ? error.message : String(error);

    // REACTION_INVALID means the emoji isn't available in this chat (group settings)
    // This is expected behavior, not a critical error - just log it
    if (errorMessage.includes("REACTION_INVALID")) {
      console.warn(
        `[Reaction] Emoji ${emoji} not available in chat ${chatId} (group reaction settings)`
      );
      return; // Don't notify admin - this is expected for groups with custom reactions
    }

    // For other errors (network issues, permission problems, etc.), notify admin
    await sendErrorNotification(
      new Error(`Failed to add reaction: ${errorMessage}`),
      {
        messageId: BigInt(messageId),
        additionalInfo: `chatId: ${chatId}, emoji: ${emoji}`,
      }
    );
  }
}
