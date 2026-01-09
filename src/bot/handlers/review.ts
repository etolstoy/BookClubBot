import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import {
  processAndCreateReview,
  checkDuplicateReview,
} from "../../services/review.service.js";

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

  // Check if message contains the review hashtag
  if (!message.text.includes(config.reviewHashtag)) {
    return;
  }

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
      await ctx.reply(
        "Could not identify a book in this review. The review was saved without book association.",
        { reply_parameters: { message_id: message.message_id } }
      );
      return;
    }

    const { review, isNewBook, reviewCount } = result;
    const bookTitle = review.book?.title || "Unknown Book";

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
