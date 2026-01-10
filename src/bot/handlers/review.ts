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

  if (!message || !("reply_to_message" in message) || !message.reply_to_message) {
    await ctx.reply(
      "Please use /review as a reply to a message you want to mark as a review."
    );
    return;
  }

  const replyMessage = message.reply_to_message as Message.TextMessage;

  if (!("text" in replyMessage) || !replyMessage.text) {
    await ctx.reply("The replied message doesn't contain any text.");
    return;
  }

  // Validate that the replied message looks like a book review
  // It should be substantial (not just a short greeting) and mention a book
  const text = replyMessage.text.trim();
  if (text.length < 20) {
    await ctx.reply(
      "The message is too short to be a book review. Reviews should be at least 20 characters.",
      { reply_parameters: { message_id: message.message_id } }
    );
    return;
  }

  // Check if the message contains common book-related patterns
  const hasBookIndicators = /(?:book|author|read|novel|story|chapter|page|ISBN|publication)/i.test(text) ||
    /["«»""]/.test(text); // Check for quotes which often indicate book titles

  if (!hasBookIndicators) {
    await ctx.reply(
      "This message doesn't appear to be a book review. Reviews should mention a book, author, or related terms.\n\n" +
      "Tip: Use the hashtag " + config.reviewHashtag + " for automatic review detection.",
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
    await ctx.reply("This review has already been saved!", {
      reply_parameters: { message_id: message.message_id },
    });
    return;
  }

  // Send processing message
  const processingMsg = await ctx.reply("Processing review... 📖", {
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
          "⚠️ You already have a pending review. Please complete it first or send /cancel to abort.",
          { reply_parameters: { message_id: message.message_id } }
        );
        return;
      }

      await ctx.reply(
        "❌ Could not identify a book in this review.\n\n" +
        "📖 Please send the ISBN of the book (ISBN-10 or ISBN-13) to save this review.\n\n" +
        "Example: 978-0-7475-3269-9\n\n" +
        "Send /cancel to abort.",
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
        Markup.button.callback("🔢 Enter ISBN manually", `book_isbn:${review.id}`),
      ]);

      // Keep current book button
      buttons.push([
        Markup.button.callback("✅ Keep current choice", `book_confirmed:${review.id}`),
      ]);

      const keyboard = Markup.inlineKeyboard(buttons);

      await ctx.reply(
        `⚠️ Multiple books detected in your review!\n\nPrimary book: "${bookTitle}"\n\nPlease confirm which book you're reviewing:`,
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
      responseText = `🎉 Congratulations! This is the first review for "${bookTitle}"!`;
    } else {
      responseText = `📚 Review saved! This is review #${reviewCount} for "${bookTitle}".`;
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
          "View all reviews",
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

    await ctx.reply("Sorry, there was an error processing this review. Please try again.", {
      reply_parameters: { message_id: message.message_id },
    });
  }
}
