import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import { checkDuplicateReview, createReview } from "../../services/review.service.js";
import { extractBookInfo } from "../../services/book-extraction.service.js";
import { enrichBookInfo } from "../../services/book-enrichment.service.js";
import { analyzeSentiment } from "../../services/sentiment.js";
import { addReaction } from "../../services/reaction.service.js";
import { logGoogleBooksFailure } from "../../services/failure-logging.service.js";
import { sendErrorNotification } from "../../services/notification.service.js";
import { createBook } from "../../services/book.service.js";
import { getRussianPluralReview } from "../../lib/string-utils.js";
import { getBookDeepLink } from "../../lib/url-utils.js";
import prisma from "../../lib/prisma.js";
import type { BotContext } from "../types/bot-context.js";
import { logOrphanedReviewCase } from "../../services/review-eval-case-logger.service.js";
import { notifySubscribersOfNewReview } from "../../services/review-notification.service.js";

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

  await processReview(ctx, message, botContext);
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

  // Delete the command message to keep the chat clean
  try {
    await ctx.deleteMessage();
  } catch (error) {
    // Non-critical: log but continue processing
    console.warn("[Review] Failed to delete command message:", error);
  }

  await processReview(ctx, replyMessage, botContext);
}

async function processReview(
  ctx: Context,
  message: Message,
  botContext?: BotContext
) {
  if (!message.from || !message.chat) {
    return;
  }

  // Extract text from message (supports both text and media captions)
  const messageText = getMessageText(message);
  if (!messageText) {
    return;
  }

  const telegramUserId = BigInt(message.from.id);
  const messageId = BigInt(message.message_id);
  const chatId = BigInt(message.chat.id);

  // Step 1: Check for duplicate
  const isDuplicate = await checkDuplicateReview(telegramUserId, messageId);
  if (isDuplicate) {
    const username = message.from.username ? `@${message.from.username}` : "Пользователь";
    await ctx.reply(`${username}, эта рецензия уже была сохранена!`, {
      reply_parameters: { message_id: message.message_id },
    });
    return;
  }

  // Step 2: Add 👀 reaction (non-blocking)
  await addReaction(ctx.telegram, chatId, message.message_id, "👀");

  try {
    // Step 3: Extract book info with LLM (no commandParams)
    const extractedInfo = await extractBookInfo(messageText, botContext?.llmClient);

    let bookId: number | null = null;

    // Step 4: Determine enrichment path based on confidence
    if (extractedInfo && extractedInfo.confidence === "high") {
      console.log(
        `[Review] HIGH confidence: ${extractedInfo.title} by ${extractedInfo.author}`
      );

      try {
        // HIGH CONFIDENCE: Try enrichment with 95% threshold
        const enrichmentResults = await enrichBookInfo(
          extractedInfo,
          undefined,
          botContext?.bookDataClient
        );

        if (enrichmentResults.matches.length > 0) {
          // Match found → create/reuse book
          const match = enrichmentResults.matches[0];
          console.log(
            `[Review] Google Books match found: ${match.title} (source: ${match.source})`
          );

          if (match.source === "local" && match.id) {
            // Reuse existing local book
            bookId = match.id;
          } else {
            // Check if book with this googleBooksId already exists
            if (match.googleBooksId) {
              const existingBook = await prisma.book.findUnique({
                where: { googleBooksId: match.googleBooksId },
              });

              if (existingBook) {
                // Reuse existing book with same googleBooksId
                console.log(
                  `[Review] Found existing book with googleBooksId: ${match.googleBooksId}`
                );
                bookId = existingBook.id;
              } else {
                // Create book from Google Books data
                const book = await createBook({
                  title: match.title,
                  author: match.author,
                  isbn: match.isbn,
                  coverUrl: match.coverUrl,
                  googleBooksId: match.googleBooksId,
                });
                bookId = book.id;
              }
            } else {
              // No googleBooksId, create book directly
              const book = await createBook({
                title: match.title,
                author: match.author,
                isbn: match.isbn,
                coverUrl: match.coverUrl,
                googleBooksId: match.googleBooksId,
              });
              bookId = book.id;
            }
          }
        } else {
          // No match → create book with just title/author
          console.log(
            `[Review] No Google Books match, creating book with title/author only`
          );
          const book = await createBook({
            title: extractedInfo.title,
            author: extractedInfo.author,
          });
          bookId = book.id;

          // Log failure for monitoring
          await logGoogleBooksFailure(
            "data/google-books-failures",
            extractedInfo.title,
            extractedInfo.author
          );
        }
      } catch (error) {
        // Enrichment failed → create book with just title/author
        console.error("[Review] Enrichment error:", error);
        const book = await createBook({
          title: extractedInfo.title,
          author: extractedInfo.author,
        });
        bookId = book.id;

        // Log failure
        await logGoogleBooksFailure(
          "data/google-books-failures",
          extractedInfo.title,
          extractedInfo.author
        );
      }
    } else {
      // LOW/MEDIUM confidence OR extraction failed → orphaned review
      console.log(
        `[Review] Low/medium confidence or extraction failed - creating orphaned review`
      );
      bookId = null;

      // Log case for evaluation (fire-and-forget, non-blocking)
      logOrphanedReviewCase({
        reviewText: messageText,
        extractedTitle: extractedInfo?.title ?? null,
        extractedAuthor: extractedInfo?.author ?? null,
        extractionConfidence: extractedInfo?.confidence ?? null,
      }).catch((error) => {
        console.error("[Review] Failed to log eval case:", error);
      });
    }

    // Step 5: Analyze sentiment
    const sentiment = await analyzeSentiment(messageText, botContext?.llmClient);

    // Step 6: Create review (with or without book)
    const review = await createReview({
      bookId,
      telegramUserId,
      telegramUsername: message.from.username || null,
      telegramDisplayName: getDisplayName(message.from),
      reviewText: messageText,
      sentiment: sentiment || "neutral",
      messageId,
      chatId,
      reviewedAt: new Date(message.date * 1000),
    });

    console.log(
      `[Review] Review created: id=${review.id}, bookId=${bookId || "null (orphaned)"}`
    );

    // Fire-and-forget: notify subscribers of new review
    notifySubscribersOfNewReview(review, ctx.telegram).catch((error) => {
      console.error("[Review] Failed to notify subscribers:", error);
    });

    // Step 7: Add 👌 reaction
    await addReaction(ctx.telegram, chatId, message.message_id, "👌");

    // Step 8: If 2+ reviews WITH book: post sentiment breakdown
    if (bookId) {
      const reviewCount = await prisma.review.count({ where: { bookId } });

      if (reviewCount >= 2) {
        // Get book details and sentiment breakdown
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        const reviews = await prisma.review.findMany({ where: { bookId } });

        const sentiments = reviews.reduce((acc, r) => {
          const sent = r.sentiment || "neutral";
          acc[sent] = (acc[sent] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const sentimentText = [
          sentiments.positive ? `👍 ${sentiments.positive}` : null,
          sentiments.neutral ? `😐 ${sentiments.neutral}` : null,
          sentiments.negative ? `👎 ${sentiments.negative}` : null,
        ]
          .filter(Boolean)
          .join(" / ");

        const reviewWord = getRussianPluralReview(reviewCount);

        const text = `Теперь на книгу «${book?.title}» написано ${reviewCount} ${reviewWord} (${sentimentText}).`;

        // Send message with deep link to book page in Mini App
        await ctx.reply(text, {
          reply_parameters: { message_id: message.message_id },
          ...Markup.inlineKeyboard([
            [
              Markup.button.url(
                "📖 Смотреть в приложении",
                getBookDeepLink(config.botUsername, bookId)
              ),
            ],
          ]),
        });
      }
    }
  } catch (error) {
    // Step 9: On error: add 😱 reaction + notify admin
    console.error("[Review] Error processing review:", error);

    await addReaction(ctx.telegram, chatId, message.message_id, "😱");

    const errorObj = error instanceof Error ? error : new Error(String(error));
    await sendErrorNotification(errorObj, {
      userId: BigInt(message.from.id),
      messageId: BigInt(message.message_id),
      additionalInfo: `chatId: ${message.chat.id}`,
    });
  }
}
