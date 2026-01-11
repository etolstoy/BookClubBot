import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import {
  processAndCreateReview,
  checkDuplicateReview,
} from "../../services/review.service.js";
import { storePendingReview } from "./book-selection.js";

function getDisplayName(from: Message["from"]): string | null {
  if (!from) return null;
  if (from.first_name && from.last_name) {
    return `${from.first_name} ${from.last_name}`;
  }
  return from.first_name || from.username || null;
}

function generateDeepLink(bookId: number): string {
  const botUsername = config.miniAppUrl.split("/").pop() || "bookclubbot";
  return `${config.miniAppUrl}?startapp=book_${bookId}`;
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

  // Validate that the replied message looks like a book review
  // It should be substantial (not just a short greeting) and mention a book
  const text = replyMessage.text.trim();
  if (text.length < 20) {
    await ctx.reply(
      "Сообщение слишком короткое для рецензии. Рецензии должны содержать минимум 20 символов.",
      { reply_parameters: { message_id: message.message_id } }
    );
    return;
  }

  // Check if the message contains common book-related patterns
  const hasBookIndicators = /(?:book|author|read|novel|story|chapter|page|ISBN|publication|книга|автор|читал|роман|история|глава|страниц|издание)/i.test(text) ||
    /["«»""]/.test(text); // Check for quotes which often indicate book titles

  if (!hasBookIndicators) {
    await ctx.reply(
      "Это сообщение не похоже на рецензию. Рецензии должны упоминать книгу, автора или связанные термины.\n\n" +
      "Совет: используйте хештег " + config.reviewHashtag + " для автоматического определения рецензий.",
      { reply_parameters: { message_id: message.message_id } }
    );
    return;
  }

  await processReview(ctx, replyMessage);
}

async function processReview(ctx: Context, message: Message.TextMessage) {
  if (!message.from) {
    return;
  }

  const telegramUserId = BigInt(message.from.id);
  const messageId = BigInt(message.message_id);

  // Check for duplicate
  const isDuplicate = await checkDuplicateReview(telegramUserId, messageId);
  if (isDuplicate) {
    await ctx.reply("Эта рецензия уже сохранена!", {
      reply_parameters: { message_id: message.message_id },
    });
    return;
  }

  // Send processing message
  const processingMsg = await ctx.reply("Обрабатываю рецензию... 📖", {
    reply_parameters: { message_id: message.message_id },
  });

  try {
    const result = await processAndCreateReview({
      telegramUserId,
      telegramUsername: message.from.username,
      telegramDisplayName: getDisplayName(message.from),
      reviewText: message.text,
      messageId,
      chatId: message.chat ? BigInt(message.chat.id) : null,
      reviewedAt: new Date(message.date * 1000),
    });

    // Delete processing message
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {
      // Ignore if can't delete
    }

    if (!result) {
      // Book extraction failed - prompt for ISBN instead of saving without book
      const userId = message.from.id.toString();

      const stored = storePendingReview(userId, {
        telegramUserId,
        telegramUsername: message.from.username,
        telegramDisplayName: getDisplayName(message.from),
        reviewText: message.text,
        messageId,
        chatId: message.chat ? BigInt(message.chat.id) : null,
        reviewedAt: new Date(message.date * 1000),
      });

      if (!stored) {
        await ctx.reply(
          "⚠️ У вас уже есть незавершённая рецензия. Пожалуйста, завершите её сначала.",
          { reply_parameters: { message_id: message.message_id } }
        );
        return;
      }

      await ctx.reply(
        "❌ Не удалось определить книгу в этой рецензии.\n\n" +
        "📖 Пожалуйста, отправьте ISBN книги (ISBN-10 или ISBN-13), чтобы сохранить эту рецензию.\n\n" +
        "Пример: 978-0-7475-3269-9",
        { reply_parameters: { message_id: message.message_id } }
      );
      return;
    }

    const { review, isNewBook, reviewCount, bookInfo } = result;
    const bookTitle = review.book?.title || "Unknown Book";

    // Check if multiple books were detected and confidence is low
    const hasAlternativeBooks = bookInfo?.alternativeBooks && bookInfo.alternativeBooks.length > 0;
    const isLowConfidence = bookInfo?.confidence === "low";

    if ((hasAlternativeBooks || isLowConfidence) && bookInfo) {
      // Show book selection menu
      const buttons = [];

      // Primary book button
      buttons.push([
        Markup.button.callback(
          `📖 ${bookInfo.title}${bookInfo.author ? ` by ${bookInfo.author}` : ""}`,
          `book_confirmed:${review.id}`
        ),
      ]);

      // Alternative books buttons
      if (hasAlternativeBooks) {
        bookInfo.alternativeBooks!.forEach((altBook, index) => {
          buttons.push([
            Markup.button.callback(
              `📚 ${altBook.title}${altBook.author ? ` by ${altBook.author}` : ""}`,
              `book_alternative:${review.id}:${index}`
            ),
          ]);
        });
      }

      // ISBN input button
      buttons.push([
        Markup.button.callback("🔢 Ввести ISBN вручную", `book_isbn:${review.id}`),
      ]);

      // Keep current book button
      buttons.push([
        Markup.button.callback("✅ Оставить текущий выбор", `book_confirmed:${review.id}`),
      ]);

      const keyboard = Markup.inlineKeyboard(buttons);

      await ctx.reply(
        `⚠️ Обнаружено несколько книг в вашей рецензии!\n\nОсновная книга: "${bookTitle}"\n\nПожалуйста, подтвердите, на какую книгу вы пишете рецензию:`,
        {
          reply_parameters: { message_id: message.message_id },
          ...keyboard,
        }
      );
      return;
    }

    // Standard success message
    let responseText: string;
    let keyboard;

    if (isNewBook) {
      responseText = `🎉 Поздравляем! Это первая рецензия на "${bookTitle}"!`;
    } else {
      responseText = `📚 Рецензия сохранена! Это рецензия #${reviewCount} на "${bookTitle}".`;
    }

    // Add sentiment badge
    if (review.sentiment) {
      const sentimentEmoji =
        review.sentiment === "positive"
          ? "👍"
          : review.sentiment === "negative"
          ? "👎"
          : "😐";
      responseText += ` ${sentimentEmoji}`;
    }

    // Add deep link button if we have a book
    if (review.book) {
      keyboard = Markup.inlineKeyboard([
        Markup.button.url(
          "Посмотреть все рецензии",
          generateDeepLink(review.book.id)
        ),
      ]);
    }

    await ctx.reply(responseText, {
      reply_parameters: { message_id: message.message_id },
      ...keyboard,
    });
  } catch (error) {
    console.error("Error processing review:", error);

    // Delete processing message
    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    } catch {
      // Ignore if can't delete
    }

    // Check if this is a Google Books rate limit error
    const isRateLimitError = error instanceof Error &&
      error.message.includes('Rate limit exceeded');

    if (isRateLimitError) {
      await ctx.reply(
        "Кажется, у нас закончились лимиты в Google Books API – попробуем импортнуть все завтра! 📚💤",
        { reply_parameters: { message_id: message.message_id } }
      );
      return;
    }

    await ctx.reply("Извините, произошла ошибка при обработке этой рецензии. Пожалуйста, попробуйте ещё раз.", {
      reply_parameters: { message_id: message.message_id },
    });
  }
}
