import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import { checkDuplicateReview } from "../../services/review.service.js";
import { extractBookInfoGPT4o } from "../../services/book-extraction.service.js";
import { enrichBookInfo } from "../../services/book-enrichment.service.js";
import {
  storeConfirmationState,
  getConfirmationState,
} from "./book-confirmation.js";
import type { BookConfirmationState } from "../types/confirmation-state.js";

function getDisplayName(from: Message["from"]): string | null {
  if (!from) return null;
  if (from.first_name && from.last_name) {
    return `${from.first_name} ${from.last_name}`;
  }
  return from.first_name || from.username || null;
}

/**
 * Generate options message UI (helper for confirmation flow)
 */
function generateOptionsMessage(state: BookConfirmationState): {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
} {
  const buttons = [];

  // Show book suggestions if we have matches
  if (state.enrichmentResults && state.enrichmentResults.matches.length > 0) {
    const { source, matches } = state.enrichmentResults;
    const sourceLabel = source === "local" ? "локальной БД" : "Google Books";

    let text = `📚 Найдены книги в ${sourceLabel}:\n\n`;
    text += "Выберите нужную книгу:\n\n";

    matches.forEach((book, index) => {
      const authorText = book.author ? ` — ${book.author}` : "";
      const similarity =
        Math.round(
          ((book.similarity.title + book.similarity.author) / 2) * 100
        ) + "%";

      text += `${index + 1}. «${book.title}»${authorText} (совпадение: ${similarity})\n`;

      buttons.push([
        Markup.button.callback(
          `📖 ${index + 1}. ${book.title}${authorText}`,
          `confirm_book:${index}`
        ),
      ]);
    });

    text += "\nИли выберите другой вариант:";

    // Add manual entry buttons
    buttons.push([Markup.button.callback("🔢 Введу ISBN", "confirm_isbn")]);
    buttons.push([
      Markup.button.callback("✏️ Введу название и автора", "confirm_manual"),
    ]);
    buttons.push([Markup.button.callback("❌ Отмена", "confirm_cancel")]);

    return {
      text,
      keyboard: Markup.inlineKeyboard(buttons),
    };
  }

  // No matches found - show manual entry options only
  let text = "❌ Книга не найдена автоматически.\n\n";
  if (state.extractedInfo) {
    text += `Искали: «${state.extractedInfo.title}»${
      state.extractedInfo.author ? ` — ${state.extractedInfo.author}` : ""
    }\n\n`;
  }
  text += "Выберите способ ввода:";

  buttons.push([Markup.button.callback("🔢 Введу ISBN", "confirm_isbn")]);
  buttons.push([
    Markup.button.callback("✏️ Введу название и автора", "confirm_manual"),
  ]);
  buttons.push([Markup.button.callback("❌ Отмена", "confirm_cancel")]);

  return {
    text,
    keyboard: Markup.inlineKeyboard(buttons),
  };
}

export async function handleReviewMessage(ctx: Context) {
  const message = ctx.message as Message.TextMessage;

  if (!message?.text || !message.from) {
    return;
  }

  // Only work in group chats
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    return;
  }

  // Ignore commands (messages starting with /)
  if (message.text.startsWith('/')) {
    console.log('[Review Handler] Ignoring command:', message.text.substring(0, 20));
    return;
  }

  // Check if message contains the review hashtag
  const hasHashtag = message.text.includes(config.reviewHashtag);
  console.log('[Review Handler] Message:', message.text.substring(0, 50));
  console.log('[Review Handler] Looking for hashtag:', config.reviewHashtag);
  console.log('[Review Handler] Has hashtag:', hasHashtag);

  if (!hasHashtag) {
    return;
  }

  console.log('[Review Handler] Processing as review');
  await processReview(ctx, message);
}

export async function handleReviewCommand(ctx: Context) {
  const message = ctx.message as Message.TextMessage;

  // Only work in group chats
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await ctx.reply(
      "Команда /review работает только в групповых чатах. Используйте её как ответ на сообщения с рецензиями на книги."
    );
    return;
  }

  // Check if command has parameters (e.g., /review Title – Author)
  const commandMatch = message.text.match(/^\/review\s+(.+)$/);
  const commandParams = commandMatch ? commandMatch[1].trim() : undefined;

  if (!message || !("reply_to_message" in message) || !message.reply_to_message) {
    await ctx.reply(
      "Пожалуйста, используйте /review как ответ на сообщение, которое хотите отметить как рецензию."
    );
    return;
  }

  const replyMessage = message.reply_to_message as Message.TextMessage;

  if (!("text" in replyMessage) || !replyMessage.text) {
    await ctx.reply("Это сообщение не содержит текста.");
    return;
  }

  await processReview(ctx, replyMessage, commandParams);
}

async function processReview(
  ctx: Context,
  message: Message.TextMessage,
  commandParams?: string
) {
  if (!message.from) {
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

  // Check if user already has a pending confirmation
  const existingState = getConfirmationState(userId);
  if (existingState) {
    await ctx.reply(
      "⚠️ У вас уже есть незавершённая рецензия. Пожалуйста, завершите её сначала или отмените.",
      { reply_parameters: { message_id: message.message_id } }
    );
    return;
  }

  // Send processing message
  const processingMsg = await ctx.reply("📖 Извлекаю информацию о книге...", {
    reply_parameters: { message_id: message.message_id },
  });

  try {
    // Step 1: Extract book info with GPT-4o
    const extractedInfo = await extractBookInfoGPT4o(message.text, commandParams);

    // Step 2: If extraction failed, show manual entry options
    if (!extractedInfo || !extractedInfo.title) {
      console.log("[Review] GPT-4o extraction failed, showing manual entry options");

      const state: BookConfirmationState = {
        reviewData: {
          telegramUserId,
          telegramUsername: message.from.username,
          telegramDisplayName: getDisplayName(message.from),
          reviewText: message.text,
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

      storeConfirmationState(userId, state);

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

    // Step 3: Enrich with 90% matching (local DB + Google Books)
    const enrichmentResults = await enrichBookInfo(extractedInfo);

    console.log(
      `[Review] Enrichment results: source=${enrichmentResults.source}, matches=${enrichmentResults.matches.length}`
    );

    // Step 4: Create confirmation state and show options
    const state: BookConfirmationState = {
      reviewData: {
        telegramUserId,
        telegramUsername: message.from.username,
        telegramDisplayName: getDisplayName(message.from),
        reviewText: message.text,
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

    storeConfirmationState(userId, state);

    const options = generateOptionsMessage(state);
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      undefined,
      options.text,
      options.keyboard
    );
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
