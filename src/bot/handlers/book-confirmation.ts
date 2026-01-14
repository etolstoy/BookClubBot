import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import prisma from "../../lib/prisma.js";
import { config } from "../../lib/config.js";
import { searchBookByISBN } from "../../services/googlebooks.js";
import { findOrCreateBook, createBook } from "../../services/book.service.js";
import { createReview } from "../../services/review.service.js";
import { analyzeSentiment } from "../../services/sentiment.js";
import { enrichBookInfo } from "../../services/book-enrichment.service.js";
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
 * Generate deep link to Mini App book page
 */
function generateDeepLink(bookId: number): string {
  return `${config.miniAppUrl}?startapp=book_${bookId}`;
}

/**
 * Generate Goodreads URL (prefer ISBN)
 */
function getGoodreadsUrl(book: EnrichedBook): string {
  if (book.isbn) {
    return `https://www.goodreads.com/book/isbn/${book.isbn}`;
  }
  const query = encodeURIComponent(
    `${book.title}${book.author ? ` ${book.author}` : ""}`
  );
  return `https://www.goodreads.com/search?q=${query}`;
}

/**
 * Generate options message UI (showing book matches or manual entry)
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
 * Generate success message
 */
function generateSuccessMessage(
  bookTitle: string,
  reviewCount: number,
  bookId: number
): {
  text: string;
  keyboard: ReturnType<typeof Markup.inlineKeyboard>;
} {
  let text: string;
  if (reviewCount === 1) {
    text = `🎉 Поздравляю с первой рецензией на «${bookTitle}»!`;
  } else {
    text = `🎉 Поздравляю с рецензией #${reviewCount}!\n\nВсего рецензий на эту книгу: ${reviewCount}`;
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.url("📱 Открыть в Mini App", generateDeepLink(bookId))],
    ]),
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
        googleBooksUrl: selectedBook.googleBooksId
          ? `https://books.google.com/books?id=${selectedBook.googleBooksId}`
          : null,
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

    // Get review count
    const reviewCount = await prisma.review.count({
      where: { bookId },
    });

    // Clear state
    clearConfirmationState(userId);

    // Send success message
    const success = generateSuccessMessage(
      selectedBook.title,
      reviewCount,
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
        await ctx.deleteMessage(message.message_id);
      } catch {
        // Ignore if can't delete (message might be too old or bot lacks permissions)
      }

      // Validate ISBN format
      const isbnRegex =
        /^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/;

      if (!isbnRegex.test(text)) {
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
        await ctx.deleteMessage(message.message_id);
      } catch {
        // Ignore if can't delete
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
        await ctx.deleteMessage(message.message_id);
      } catch {
        // Ignore if can't delete
      }

      // Save author and create book directly
      const title = state.tempData.enteredTitle!;
      const author = text;

      try {
        // Create book with manually entered data (no OpenAI normalization)
        const book = await createBook({
          title,
          author,
        });

        // Analyze sentiment
        const sentiment = await analyzeSentiment(state.reviewData.reviewText);

        // Create review
        await createReview({
          bookId: book.id,
          telegramUserId: state.reviewData.telegramUserId,
          telegramUsername: state.reviewData.telegramUsername,
          telegramDisplayName: state.reviewData.telegramDisplayName,
          reviewText: state.reviewData.reviewText,
          messageId: state.reviewData.messageId,
          chatId: state.reviewData.chatId,
          reviewedAt: state.reviewData.reviewedAt,
          sentiment,
        });

        // Get review count (should be 1 since this is a new book)
        const reviewCount = await prisma.review.count({
          where: { bookId: book.id },
        });

        // Clear state
        clearConfirmationState(userId);

        // Send success message
        const success = generateSuccessMessage(title, reviewCount, book.id);
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
