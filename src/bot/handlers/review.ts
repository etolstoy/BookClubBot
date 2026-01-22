import { Context } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import { checkDuplicateReview } from "../../services/review.service.js";
import { extractBookInfo } from "../../services/book-extraction.service.js";
import { enrichBookInfo } from "../../services/book-enrichment.service.js";
import {
  storeConfirmationState,
  getConfirmationStateByUser,
  clearConfirmationState,
  generateOptionsMessage,
} from "./book-confirmation.js";
import type { BookConfirmationState } from "../types/confirmation-state.js";
import type { BotContext } from "../types/bot-context.js";

function getDisplayName(from: Message["from"]): string | null {
  if (!from) return null;
  if (from.first_name && from.last_name) {
    return `${from.first_name} ${from.last_name}`;
  }
  return from.first_name || from.username || null;
}

/**
 * Extracts text content from a message, supporting both regular text messages
 * and media messages with captions (photos, videos, documents, etc.)
 */
function getMessageText(message: Message): string | undefined {
  if ("text" in message) {
    return message.text;
  }
  if ("caption" in message) {
    return message.caption;
  }
  return undefined;
}

/**
 * Gets the author of a message, handling forwarded channel messages.
 * For forwarded channel messages (which don't have a 'from' field),
 * returns the forwarder's identity instead.
 */
function getMessageAuthor(message: Message): Message["from"] | undefined {
  // If message has a 'from' field, use it (normal messages or forwarded by user)
  if (message.from) {
    return message.from;
  }

  // For messages forwarded from channels (no 'from' field),
  // we can't get the original author, so this message can't be processed
  return undefined;
}

export async function handleReviewMessage(ctx: Context, botContext?: BotContext) {
  const message = ctx.message;

  if (!message) {
    return;
  }

  // Extract text from either text message or media caption
  const messageText = getMessageText(message);

  if (!messageText || !message.from) {
    return;
  }

  // Only work in group chats
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    return;
  }

  // Ignore commands (messages starting with /)
  if (messageText.startsWith("/")) {
    return;
  }

  // Check if message contains the review hashtag
  if (!messageText.includes(config.reviewHashtag)) {
    return;
  }

  await processReview(ctx, message, undefined, botContext);
}

export async function handleReviewCommand(ctx: Context, botContext?: BotContext) {
  const message = ctx.message;

  if (!message) {
    return;
  }

  // Only work in group chats
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply(
      "Команда /review работает только в групповых чатах. Используйте её как ответ на сообщения с рецензиями на книги."
    );
    return;
  }

  // Extract command text and check for parameters (e.g., /review Title – Author)
  const commandText = getMessageText(message);
  const commandMatch = commandText?.match(/^\/review\s+(.+)$/);
  const commandParams = commandMatch ? commandMatch[1].trim() : undefined;

  if (!("reply_to_message" in message) || !message.reply_to_message) {
    await ctx.reply(
      "Пожалуйста, используйте /review как ответ на сообщение, которое хотите отметить как рецензию."
    );
    return;
  }

  const replyMessage = message.reply_to_message;

  // Extract text from replied message (supports both text and media with captions)
  const replyText = getMessageText(replyMessage);

  if (!replyText) {
    await ctx.reply(
      "Я не могу прочитать это сообщение. Убедитесь, что сообщение содержит текст или подпись к медиа."
    );
    return;
  }

  await processReview(ctx, replyMessage, commandParams, botContext);
}

async function processReview(
  ctx: Context,
  message: Message,
  commandParams?: string,
  botContext?: BotContext
) {
  if (!message.from) {
    return;
  }

  // Extract text from message (supports both text and media captions)
  const messageText = getMessageText(message);
  if (!messageText) {
    return;
  }

  const telegramUserId = BigInt(message.from.id);
  const messageId = BigInt(message.message_id);
  const userId = message.from.id.toString();

  // Check for duplicate
  const isDuplicate = await checkDuplicateReview(telegramUserId, messageId);
  if (isDuplicate) {
    await ctx.reply("Эта рецензия уже сохранена!", {
      reply_parameters: { message_id: message.message_id },
    });
    return;
  }

  // Check if user has pending confirmation - replace it with new one
  const chatId = message.chat ? message.chat.id.toString() : null;
  if (chatId) {
    const existingState = getConfirmationStateByUser(chatId, userId);
    if (existingState) {
      // Delete old confirmation message
      if (existingState.statusMessageId && existingState.reviewData.chatId) {
        try {
          await ctx.telegram.deleteMessage(
            Number(existingState.reviewData.chatId),
            existingState.statusMessageId
          );
        } catch {
          // Ignore if message can't be deleted (already deleted, no permissions, etc.)
        }
      }
      clearConfirmationState(chatId, existingState.statusMessageId, userId);
      console.log(`[Review] Replaced pending review for user ${userId}`);
    }
  }

  // Send processing message
  const processingMsg = await ctx.reply("📖 Извлекаю информацию о книге...", {
    reply_parameters: { message_id: message.message_id },
  });

  try {
    // Step 1: Extract book info with LLM
    const extractedInfo = await extractBookInfo(messageText, commandParams, botContext?.llmClient);

    // Step 2: If extraction failed, show manual entry options
    if (!extractedInfo || !extractedInfo.title) {
      console.log("[Review] LLM extraction failed, showing manual entry options");

      const state: BookConfirmationState = {
        reviewData: {
          telegramUserId,
          telegramUsername: message.from.username,
          telegramDisplayName: getDisplayName(message.from),
          reviewText: messageText,
          messageId,
          chatId: message.chat ? BigInt(message.chat.id) : null,
          reviewedAt: new Date(message.date * 1000),
        },
        extractedInfo: null,
        enrichmentResults: null,
        state: "showing_options",
        statusMessageId: processingMsg.message_id,
        tempData: {},
        createdAt: new Date(),
      };

      if (chatId) {
        storeConfirmationState(chatId, processingMsg.message_id, userId, state);
      }

      const options = generateOptionsMessage(state);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        options.text,
        options.keyboard
      );
      return;
    }

    console.log(
      `[Review] Extracted: ${extractedInfo.title} by ${extractedInfo.author}, confidence: ${extractedInfo.confidence}`
    );

    // Step 3: Enrich with 90% matching (local DB + external API)
    const enrichmentResults = await enrichBookInfo(extractedInfo, undefined, botContext?.bookDataClient);

    console.log(
      `[Review] Enrichment results: source=${enrichmentResults.source}, matches=${enrichmentResults.matches.length}`
    );

    // Step 4: Create confirmation state and show options
    const state: BookConfirmationState = {
      reviewData: {
        telegramUserId,
        telegramUsername: message.from.username,
        telegramDisplayName: getDisplayName(message.from),
        reviewText: messageText,
        messageId,
        chatId: message.chat ? BigInt(message.chat.id) : null,
        reviewedAt: new Date(message.date * 1000),
      },
      extractedInfo,
      enrichmentResults,
      state: "showing_options",
      statusMessageId: processingMsg.message_id,
      tempData: {},
      createdAt: new Date(),
    };

    if (chatId) {
      storeConfirmationState(chatId, processingMsg.message_id, userId, state);
    }

    const options = generateOptionsMessage(state);
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      options.text,
      options.keyboard
    );
    console.log(`[Review] Options message sent for user ${userId}, messageId: ${processingMsg.message_id}`);
  } catch (error) {
    console.error("[Review] Error processing review:", error);

    // Delete processing message
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {
      // Ignore if can't delete
    }

    // Check for specific errors
    const isRateLimitError =
      error instanceof Error && error.message.includes("Rate limit exceeded");

    if (isRateLimitError) {
      await ctx.reply(
        "Кажется, у нас закончились лимиты в Google Books API – попробуем импортнуть все завтра! 📚💤",
        { reply_parameters: { message_id: message.message_id } }
      );
      return;
    }

    await ctx.reply(
      "❌ Произошла ошибка при обработке рецензии. Пожалуйста, попробуйте ещё раз.",
      { reply_parameters: { message_id: message.message_id } }
    );
  }
}
