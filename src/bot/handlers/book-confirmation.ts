import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import prisma from "../../lib/prisma.js";
import { config } from "../../lib/config.js";
import { isValidISBN } from "../../lib/isbn-utils.js";
import { searchBookByISBN } from "../../services/googlebooks.js";
import { findOrCreateBook, createBook } from "../../services/book.service.js";
import { createReview } from "../../services/review.service.js";
import { analyzeSentiment } from "../../services/sentiment.js";
import { enrichBookInfo, searchLocalBooks } from "../../services/book-enrichment.service.js";
import type {
  BookConfirmationState,
  EnrichedBook,
} from "../types/confirmation-state.js";

// State storage (in production, consider using Redis)
const pendingBookConfirmations = new Map<string, BookConfirmationState>();

/**
 * Store confirmation state for a user
 */
export function storeConfirmationState(
  userId: string,
  state: BookConfirmationState
): void {
  pendingBookConfirmations.set(userId, state);
}

/**
 * Get confirmation state for a user
 */
export function getConfirmationState(userId: string): BookConfirmationState | null {
  return pendingBookConfirmations.get(userId) || null;
}

/**
 * Clear confirmation state for a user
 */
export function clearConfirmationState(userId: string): void {
  pendingBookConfirmations.delete(userId);
}

/**
 * Cleanup stale states (older than 15 minutes)
 */
export function cleanupStaleStates(): void {
  const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  const now = Date.now();

  for (const [userId, state] of pendingBookConfirmations.entries()) {
    const age = now - state.createdAt.getTime();
    if (age > TIMEOUT_MS) {
      console.log(`[Confirmation] Cleaning up stale state for user ${userId}`);
      pendingBookConfirmations.delete(userId);
    }
  }
}

/**
 * Generate options message UI (showing book matches or manual entry)
 */
export function generateOptionsMessage(state: BookConfirmationState): {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
} {
  const buttons = [];

  // Show book suggestions if we have matches
  if (state.enrichmentResults && state.enrichmentResults.matches.length > 0) {
    const { source, matches } = state.enrichmentResults;

    // Check if we have mixed sources
    const hasLocalBooks = matches.some((m) => m.source === "local");
    const hasGoogleBooks = matches.some((m) => m.source === "google");

    let sourceLabel: string;
    if (hasLocalBooks && hasGoogleBooks) {
      sourceLabel = "базе данных";
    } else if (source === "local") {
      sourceLabel = "локальной БД";
    } else {
      sourceLabel = "Google Books";
    }

    let text = `📚 Найдены книги в ${sourceLabel}:\n\n`;
    text += "Выберите нужную книгу:\n\n";

    matches.forEach((book, index) => {
      const authorText = book.author ? ` — ${book.author}` : "";

      text += `${index + 1}. «${book.title}»${authorText}\n`;

      buttons.push([
        Markup.button.callback(
          `📖 ${index + 1}. ${book.title}`,
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
  let text = "❌ Книга не найдена в Google Books. Можешь попробовать поискать еще раз через ISBN, либо создать ее вручную (но не будет красивой обложки). Что выберешь?";

  // If we have extracted info, show it as a quick-select button
  if (state.extractedInfo) {
    const authorText = state.extractedInfo.author ? ` — ${state.extractedInfo.author}` : "";
    const buttonText = `📖 «${state.extractedInfo.title}»${authorText}`;
    buttons.push([Markup.button.callback(buttonText, "confirm_extracted")]);
  }

  buttons.push([Markup.button.callback("🔢 Введу ISBN", "confirm_isbn")]);
  buttons.push([
    Markup.button.callback(
      state.extractedInfo ? "✏️ Другое название и автор" : "✏️ Введу название и автора",
      "confirm_manual"
    ),
  ]);
  buttons.push([Markup.button.callback("❌ Отмена", "confirm_cancel")]);

  return {
    text,
    keyboard: Markup.inlineKeyboard(buttons),
  };
}

/**
 * Generate ISBN prompt message
 */
function generateIsbnPromptMessage(): {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
} {
  return {
    text:
      "📖 Пожалуйста, введите ISBN книги (ISBN-10 или ISBN-13).\n\n" +
      "Пример: 978-0-7475-3269-9",
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback("❌ Отмена", "confirm_cancel")],
    ]),
  };
}

/**
 * Generate title prompt message
 */
function generateTitlePromptMessage(): {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
} {
  return {
    text: "📖 Введите название книги:",
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback("❌ Отмена", "confirm_cancel")],
    ]),
  };
}

/**
 * Generate author prompt message
 */
function generateAuthorPromptMessage(
  title: string
): {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
} {
  return {
    text: `📖 Книга: «${title}»\n\n✍️ Введите имя автора:`,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback("❌ Отмена", "confirm_cancel")],
    ]),
  };
}

/**
 * Get Russian ordinal number (первой, второй, третьей, etc.)
 */
function getOrdinalNumber(n: number): string {
  const ordinals: { [key: number]: string } = {
    1: "первой",
    2: "второй",
    3: "третьей",
    4: "четвертой",
    5: "пятой",
    6: "шестой",
    7: "седьмой",
    8: "восьмой",
    9: "девятой",
    10: "десятой",
    11: "одиннадцатой",
    12: "двенадцатой",
    13: "тринадцатой",
    14: "четырнадцатой",
    15: "пятнадцатой",
    16: "шестнадцатой",
    17: "семнадцатой",
    18: "восемнадцатой",
    19: "девятнадцатой",
    20: "двадцатой",
  };

  if (ordinals[n]) {
    return ordinals[n];
  }

  // For numbers > 20, construct from tens + ones
  const tens = Math.floor(n / 10) * 10;
  const ones = n % 10;

  const tensWords: { [key: number]: string } = {
    20: "двадцать",
    30: "тридцать",
    40: "сорок",
    50: "пятьдесят",
    60: "шестьдесят",
    70: "семьдесят",
    80: "восемьдесят",
    90: "девяносто",
  };

  const onesOrdinals: { [key: number]: string } = {
    1: "первой",
    2: "второй",
    3: "третьей",
    4: "четвертой",
    5: "пятой",
    6: "шестой",
    7: "седьмой",
    8: "восьмой",
    9: "девятой",
  };

  if (ones === 0) {
    // 20th, 30th, etc.
    return tensWords[tens] + "ой";
  }

  return tensWords[tens] + " " + onesOrdinals[ones];
}

/**
 * Get Russian plural form for "рецензия"
 */
function getReviewPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod100 >= 11 && mod100 <= 19) {
    return "рецензий";
  }

  if (mod10 === 1) {
    return "рецензия";
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return "рецензии";
  }

  return "рецензий";
}

/**
 * Generate success message
 */
function generateSuccessMessage(
  bookTitle: string,
  userReviewCount: number,
  bookReviewCount: number,
  bookId: number
): {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
} {
  let text: string;

  // Primary message: congratulate user on their review count
  if (userReviewCount === 1) {
    text = `🎉 Поздравляю с ${getOrdinalNumber(userReviewCount)} рецензией!\n\n`;
  } else {
    text = `🎉 Поздравляю с твоей ${getOrdinalNumber(userReviewCount)} рецензией!\n\n`;
  }

  // Secondary message: mention book review count
  if (bookReviewCount === 1) {
    text += `Это первая рецензия на «${bookTitle}».`;
  } else {
    text += `На «${bookTitle}» написано уже ${bookReviewCount} ${getReviewPlural(bookReviewCount)}.`;
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard([]), // No buttons
  };
}

/**
 * Callback handler: Book selected from options
 */
export async function handleBookSelected(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("data" in callbackQuery) || !("from" in callbackQuery))
    return;

  const userId = callbackQuery.from.id.toString();
  const state = getConfirmationState(userId);

  if (!state) {
    await ctx.answerCbQuery("❌ Сессия истекла. Пожалуйста, отправьте рецензию заново.");
    return;
  }

  const bookIndex = parseInt(callbackQuery.data.split(":")[1]);
  const selectedBook =
    state.enrichmentResults?.matches[bookIndex];

  if (!selectedBook) {
    await ctx.answerCbQuery("❌ Книга не найдена");
    return;
  }

  await ctx.answerCbQuery("✅ Создаю рецензию...");

  try {
    // Find or create book in database
    let bookId: number;

    if (selectedBook.source === "local" && selectedBook.id) {
      // Book already exists in local DB
      bookId = selectedBook.id;
    } else {
      // Create from Google Books data
      const book = await createBook({
        title: selectedBook.title,
        author: selectedBook.author,
        googleBooksId: selectedBook.googleBooksId || null,
        coverUrl: selectedBook.coverUrl,
        isbn: selectedBook.isbn,
      });
      bookId = book.id;
    }

    // Analyze sentiment
    const sentiment = await analyzeSentiment(state.reviewData.reviewText);

    // Create review
    await createReview({
      bookId,
      telegramUserId: state.reviewData.telegramUserId,
      telegramUsername: state.reviewData.telegramUsername,
      telegramDisplayName: state.reviewData.telegramDisplayName,
      reviewText: state.reviewData.reviewText,
      messageId: state.reviewData.messageId,
      chatId: state.reviewData.chatId,
      reviewedAt: state.reviewData.reviewedAt,
      sentiment,
    });

    // Get review counts
    const userReviewCount = await prisma.review.count({
      where: { telegramUserId: state.reviewData.telegramUserId },
    });
    const bookReviewCount = await prisma.review.count({
      where: { bookId },
    });

    // Clear state
    clearConfirmationState(userId);

    // Send success message
    const success = generateSuccessMessage(
      selectedBook.title,
      userReviewCount,
      bookReviewCount,
      bookId
    );
    await ctx.editMessageText(success.text, success.keyboard);
  } catch (error) {
    console.error("[Confirmation] Error creating review:", error);
    await ctx.editMessageText(
      "❌ Произошла ошибка при создании рецензии. Пожалуйста, попробуйте ещё раз."
    );
    clearConfirmationState(userId);
  }
}

/**
 * Callback handler: User wants to enter ISBN
 */
export async function handleIsbnRequested(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("from" in callbackQuery)) return;

  const userId = callbackQuery.from.id.toString();
  const state = getConfirmationState(userId);

  if (!state) {
    await ctx.answerCbQuery("❌ Сессия истекла. Пожалуйста, отправьте рецензию заново.");
    return;
  }

  // Update state
  state.state = "awaiting_isbn";
  storeConfirmationState(userId, state);

  await ctx.answerCbQuery();

  // Update message
  const prompt = generateIsbnPromptMessage();
  await ctx.editMessageText(prompt.text, prompt.keyboard);
}

/**
 * Callback handler: User wants to enter title/author manually
 */
export async function handleManualEntryRequested(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("from" in callbackQuery)) return;

  const userId = callbackQuery.from.id.toString();
  const state = getConfirmationState(userId);

  if (!state) {
    await ctx.answerCbQuery("❌ Сессия истекла. Пожалуйста, отправьте рецензию заново.");
    return;
  }

  // Update state
  state.state = "awaiting_title";
  storeConfirmationState(userId, state);

  await ctx.answerCbQuery();

  // Update message
  const prompt = generateTitlePromptMessage();
  await ctx.editMessageText(prompt.text, prompt.keyboard);
}

/**
 * Callback handler: User wants to cancel
 */
export async function handleCancel(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("from" in callbackQuery)) return;

  const userId = callbackQuery.from.id.toString();
  clearConfirmationState(userId);

  await ctx.answerCbQuery("❌ Отменено");
  await ctx.editMessageText("❌ Создание рецензии отменено.");
}

/**
 * Callback handler: User confirms using extracted book info
 */
export async function handleExtractedBookConfirmed(ctx: Context) {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("from" in callbackQuery)) return;

  const userId = callbackQuery.from.id.toString();
  const state = getConfirmationState(userId);

  if (!state || !state.extractedInfo) {
    await ctx.answerCbQuery("❌ Сессия истекла. Пожалуйста, отправьте рецензию заново.");
    return;
  }

  await ctx.answerCbQuery("✅ Создаю рецензию...");

  const title = state.extractedInfo.title;
  const author = state.extractedInfo.author || "";

  try {
    // Check if book already exists in local DB with 100% similarity
    const existingBooks = await searchLocalBooks(title, author, 1.0);

    let bookId: number;

    if (existingBooks.length > 0) {
      // Book exists with exact match, use it
      bookId = existingBooks[0].id!;
      console.log(
        `[Confirmation] Found existing book with exact match: "${title}" by ${author} (ID: ${bookId})`
      );
    } else {
      // Book doesn't exist, create new one without Google Books data
      const book = await createBook({
        title,
        author: author || null,
      });
      bookId = book.id;
      console.log(
        `[Confirmation] Created new book from extracted info: "${title}" by ${author} (ID: ${bookId})`
      );
    }

    // Analyze sentiment
    const sentiment = await analyzeSentiment(state.reviewData.reviewText);

    // Create review
    await createReview({
      bookId,
      telegramUserId: state.reviewData.telegramUserId,
      telegramUsername: state.reviewData.telegramUsername,
      telegramDisplayName: state.reviewData.telegramDisplayName,
      reviewText: state.reviewData.reviewText,
      messageId: state.reviewData.messageId,
      chatId: state.reviewData.chatId,
      reviewedAt: state.reviewData.reviewedAt,
      sentiment,
    });

    // Get review counts
    const userReviewCount = await prisma.review.count({
      where: { telegramUserId: state.reviewData.telegramUserId },
    });
    const bookReviewCount = await prisma.review.count({
      where: { bookId },
    });

    // Clear state
    clearConfirmationState(userId);

    // Send success message
    const success = generateSuccessMessage(title, userReviewCount, bookReviewCount, bookId);
    await ctx.editMessageText(success.text, success.keyboard);
  } catch (error) {
    console.error("[Confirmation] Error creating book/review from extracted info:", error);
    await ctx.editMessageText(
      "❌ Произошла ошибка при создании рецензии. Пожалуйста, попробуйте ещё раз."
    );
    clearConfirmationState(userId);
  }
}

/**
 * Text input handler for ISBN/title/author
 * Returns true if message was handled, false otherwise
 */
export async function handleTextInput(ctx: Context): Promise<boolean> {
  const message = ctx.message;
  if (!message || !("text" in message) || !("from" in message)) return false;

  const userId = message.from.id.toString();
  const state = getConfirmationState(userId);

  if (!state) {
    return false; // Not in confirmation flow
  }

  const text = message.text.trim();

  // Handle based on current state
  switch (state.state) {
    case "awaiting_isbn": {
      // Delete user's message to keep chat clean
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, message.message_id);
      } catch (error) {
        console.log("[Confirmation] Could not delete ISBN message:", error);
        // Ignore if can't delete (message might be too old or bot lacks permissions)
      }

      // Validate ISBN format
      if (!isValidISBN(text)) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          state.statusMessageId,
          undefined,
          "❌ Неверный формат ISBN. Пожалуйста, попробуйте ещё раз.\n\n" +
            "Пример: 978-0-7475-3269-9",
          Markup.inlineKeyboard([
            [Markup.button.callback("❌ Отмена", "confirm_cancel")],
          ])
        );
        return true;
      }

      // Search Google Books by ISBN
      try {
        const result = await searchBookByISBN(text);

        if (!result) {
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            state.statusMessageId,
            undefined,
            "❌ Книга с этим ISBN не найдена в Google Books.\n\n" +
              "Попробуйте ввести другой ISBN или используйте ручной ввод.",
            Markup.inlineKeyboard([
              [Markup.button.callback("🔢 Ввести другой ISBN", "confirm_isbn")],
              [Markup.button.callback("✏️ Ввести название и автора", "confirm_manual")],
              [Markup.button.callback("❌ Отмена", "confirm_cancel")],
            ])
          );
          return true;
        }

        // Re-enrich with the new book
        const enrichmentResults = await enrichBookInfo({
          title: result.title,
          author: result.author,
          confidence: "high",
        });

        // Update state with new enrichment results
        state.enrichmentResults = enrichmentResults;
        state.state = "showing_options";
        storeConfirmationState(userId, state);

        // Update status message with new options
        const options = generateOptionsMessage(state);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          state.statusMessageId,
          undefined,
          options.text,
          options.keyboard
        );
      } catch (error) {
        console.error("[Confirmation] Error processing ISBN:", error);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          state.statusMessageId,
          undefined,
          "❌ Ошибка при поиске книги. Пожалуйста, попробуйте ещё раз.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🔢 Ввести другой ISBN", "confirm_isbn")],
            [Markup.button.callback("❌ Отмена", "confirm_cancel")],
          ])
        );
      }

      return true;
    }

    case "awaiting_title": {
      // Delete user's message to keep chat clean
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, message.message_id);
      } catch (error) {
        console.log("[Confirmation] Could not delete title message:", error);
        // Ignore if can't delete (message might be too old or bot lacks permissions)
      }

      // Save title and move to author input
      state.tempData.enteredTitle = text;
      state.state = "awaiting_author";
      storeConfirmationState(userId, state);

      // Update message to ask for author
      const prompt = generateAuthorPromptMessage(text);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        state.statusMessageId,
        undefined,
        prompt.text,
        prompt.keyboard
      );

      return true;
    }

    case "awaiting_author": {
      // Delete user's message to keep chat clean
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, message.message_id);
      } catch (error) {
        console.log("[Confirmation] Could not delete author message:", error);
        // Ignore if can't delete (message might be too old or bot lacks permissions)
      }

      // Save author
      const title = state.tempData.enteredTitle!;
      const author = text;

      try {
        // Check if book already exists in local DB with 100% similarity
        const existingBooks = await searchLocalBooks(title, author, 1.0);

        let bookId: number;
        let isExistingBook = false;

        if (existingBooks.length > 0) {
          // Book exists with exact match, use it
          bookId = existingBooks[0].id!;
          isExistingBook = true;
          console.log(
            `[Confirmation] Found existing book with exact match: "${title}" by ${author} (ID: ${bookId})`
          );
        } else {
          // Book doesn't exist, create new one
          const book = await createBook({
            title,
            author,
          });
          bookId = book.id;
          console.log(
            `[Confirmation] Created new book: "${title}" by ${author} (ID: ${bookId})`
          );
        }

        // Analyze sentiment
        const sentiment = await analyzeSentiment(state.reviewData.reviewText);

        // Create review
        await createReview({
          bookId,
          telegramUserId: state.reviewData.telegramUserId,
          telegramUsername: state.reviewData.telegramUsername,
          telegramDisplayName: state.reviewData.telegramDisplayName,
          reviewText: state.reviewData.reviewText,
          messageId: state.reviewData.messageId,
          chatId: state.reviewData.chatId,
          reviewedAt: state.reviewData.reviewedAt,
          sentiment,
        });

        // Get review counts
        const userReviewCount = await prisma.review.count({
          where: { telegramUserId: state.reviewData.telegramUserId },
        });
        const bookReviewCount = await prisma.review.count({
          where: { bookId },
        });

        // Clear state
        clearConfirmationState(userId);

        // Send success message
        const success = generateSuccessMessage(title, userReviewCount, bookReviewCount, bookId);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          state.statusMessageId,
          undefined,
          success.text,
          success.keyboard
        );
      } catch (error) {
        console.error("[Confirmation] Error creating book/review:", error);
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          state.statusMessageId,
          undefined,
          "❌ Произошла ошибка при создании рецензии. Пожалуйста, попробуйте ещё раз."
        );
        clearConfirmationState(userId);
      }

      return true;
    }

    default:
      return false;
  }
}
