import type { Telegram } from "telegraf";
import type { MessageEntity } from "telegraf/types";
import { Markup } from "telegraf";
import type { Book, Review } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { getBookDeepLink } from "../lib/url-utils.js";
import { getRussianPluralReview } from "../lib/string-utils.js";
import { getActiveSubscribers, deactivateSubscription } from "./subscription.service.js";
import { sendWarningNotification } from "./notification.service.js";
import type { FormattedMessageText } from "../lib/message-text.js";

// Rate limiting: Telegram allows ~30 messages/second to different users
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

export type ReviewWithBook = Review & { book: Book | null };

// Track delivery failures for threshold alerting
interface FailureTracker {
  count: number;
  windowStart: number;
}

const failureTracker: FailureTracker = {
  count: 0,
  windowStart: Date.now(),
};

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Reset failure tracker if window has passed
 */
function resetFailureTrackerIfNeeded(): void {
  const now = Date.now();
  if (now - failureTracker.windowStart > FAILURE_WINDOW_MS) {
    failureTracker.count = 0;
    failureTracker.windowStart = now;
  }
}

/**
 * Track a delivery failure and alert admin if threshold exceeded
 */
async function trackDeliveryFailure(error: Error, userId: bigint): Promise<void> {
  resetFailureTrackerIfNeeded();
  failureTracker.count++;

  console.error(
    `[ReviewNotification] Delivery failed to user ${userId}: ${error.message}`
  );

  if (failureTracker.count === FAILURE_THRESHOLD) {
    await sendWarningNotification(
      `Review notification delivery failures exceeded threshold (${FAILURE_THRESHOLD} in 5 min)`,
      {
        operation: "Review Notification",
        additionalInfo: `Last error: ${error.message}`,
      }
    );
  }
}

/**
 * Check if error is a "bot blocked by user" error (403)
 */
function isBotBlockedError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("403") || error.message.includes("blocked");
  }
  return false;
}

/**
 * Format sentiment breakdown text (e.g., "👍 3 / 😐 1 / 👎 0")
 */
function formatSentimentBreakdown(
  sentiments: Record<string, number>
): string {
  return [
    sentiments.positive ? `👍 ${sentiments.positive}` : null,
    sentiments.neutral ? `😐 ${sentiments.neutral}` : null,
    sentiments.negative ? `👎 ${sentiments.negative}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

/**
 * Format reviewer info line
 */
function formatReviewerInfo(
  displayName: string | null,
  username: string | null
): string {
  const name = displayName || "Аноним";
  const usernameStr = username ? ` (@${username})` : "";
  return `👤 ${name}${usernameStr}`;
}

/**
 * Format the notification caption/text
 */
async function formatNotificationText(
  review: ReviewWithBook,
  reviewEntities: MessageEntity[],
): Promise<FormattedMessageText> {
  const lines: string[] = [];

  // Header
  const header = "Новая рецензия в чате Вастрик.Книги:";
  lines.push(header);
  lines.push(""); // Empty line

  // Content is sent literally, with formatting supplied separately as entities.
  if (review.book) {
    const title = review.book.title;
    const author = review.book.author ? ` — ${review.book.author}` : "";
    lines.push(`📚 «${title}»${author}`);
    lines.push(""); // Empty line
  }

  lines.push(formatReviewerInfo(review.telegramDisplayName, review.telegramUsername));

  lines.push(""); // Empty line

  const reviewOffset = lines.join("\n").length + 1;
  lines.push(review.reviewText);

  // Sentiment breakdown (only if book exists)
  if (review.book) {
    const reviews = await prisma.review.findMany({
      where: { bookId: review.book.id },
      select: { sentiment: true },
    });

    const sentiments = reviews.reduce(
      (acc, r) => {
        const sent = r.sentiment || "neutral";
        acc[sent] = (acc[sent] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const totalReviews = reviews.length;
    const sentimentText = formatSentimentBreakdown(sentiments);
    const reviewWord = getRussianPluralReview(totalReviews);

    lines.push(""); // Empty line
    lines.push(`${sentimentText} — всего ${totalReviews} ${reviewWord}`);
  }

  return {
    text: lines.join("\n"),
    entities: [
      { type: "bold", offset: 0, length: header.length },
      ...reviewEntities.map(entity => ({ ...entity, offset: entity.offset + reviewOffset })),
    ],
  };
}

/**
 * Build inline keyboard with deep link to book page
 */
function buildNotificationKeyboard(bookId: number | null) {
  if (!bookId) {
    return undefined;
  }

  return Markup.inlineKeyboard([
    [
      Markup.button.url(
        "📖 Смотреть в приложении",
        getBookDeepLink(config.botUsername, bookId)
      ),
    ],
  ]);
}

/**
 * Send notification to a single subscriber
 */
async function sendNotificationToSubscriber(
  telegram: Telegram,
  userId: bigint,
  review: ReviewWithBook,
  caption: FormattedMessageText
): Promise<void> {
  const keyboard = buildNotificationKeyboard(review.bookId);
  // Use string to avoid BigInt precision loss with large Telegram IDs
  const chatId = userId.toString();

  try {
    // Send as text message to avoid Telegram caption length limits (1024 chars)
    await telegram.sendMessage(chatId, caption.text, {
      entities: caption.entities,
      // A preview for a link inside a spoiler could reveal the hidden content.
      link_preview_options: { is_disabled: true },
      ...keyboard,
    });
  } catch (error) {
    if (isBotBlockedError(error)) {
      // Auto-deactivate subscription for users who blocked the bot
      await deactivateSubscription(userId);
      console.log(`[ReviewNotification] Auto-deactivated subscription for blocked user ${userId}`);
    } else {
      await trackDeliveryFailure(
        error instanceof Error ? error : new Error(String(error)),
        userId
      );
    }
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Notify all active subscribers about a new review
 * This function is fire-and-forget - errors are logged but don't propagate
 * Uses batching to respect Telegram rate limits (~30 msg/sec)
 */
export async function notifySubscribersOfNewReview(
  review: ReviewWithBook,
  telegram: Telegram,
  reviewEntities: MessageEntity[] = [],
): Promise<void> {
  try {
    const subscribers = await getActiveSubscribers();

    if (subscribers.length === 0) {
      console.log("[ReviewNotification] No active subscribers, skipping");
      return;
    }

    console.log(
      `[ReviewNotification] Sending notifications to ${subscribers.length} subscribers`
    );

    const caption = await formatNotificationText(review, reviewEntities);

    // Send in batches to respect Telegram rate limits
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);

      const sendPromises = batch.map((userId) =>
        sendNotificationToSubscriber(telegram, userId, review, caption)
      );

      await Promise.allSettled(sendPromises);

      // Delay between batches (skip delay after last batch)
      if (i + BATCH_SIZE < subscribers.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log("[ReviewNotification] All notifications dispatched");
  } catch (error) {
    console.error("[ReviewNotification] Error in notification dispatch:", error);
    // Don't rethrow - this is fire-and-forget
  }
}
