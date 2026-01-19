import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../lib/config.js";
import { chatFilter, errorHandler } from "./middleware/auth.js";
import { handleReviewMessage, handleReviewCommand } from "./handlers/review.js";
import {
  handleStartCommand,
} from "./handlers/commands.js";
import {
  handleBookSelected,
  handleIsbnRequested,
  handleManualEntryRequested,
  handleCancel,
  handleExtractedBookConfirmed,
  handleTextInput as handleConfirmationTextInput,
} from "./handlers/book-confirmation.js";
import { initNotificationService, sendSuccessNotification } from "../services/notification.service.js";

export function createBot() {
  const bot = new Telegraf(config.botToken);

  // Middleware
  bot.use(errorHandler);
  bot.use(chatFilter);

  // Commands
  bot.command("start", handleStartCommand);
  bot.command("review", handleReviewCommand);

  // Callback query handlers for confirmation flow
  bot.action(/^confirm_book:/, handleBookSelected);
  bot.action(/^confirm_isbn$/, handleIsbnRequested);
  bot.action(/^confirm_manual$/, handleManualEntryRequested);
  bot.action(/^confirm_extracted$/, handleExtractedBookConfirmed);
  bot.action(/^confirm_cancel$/, handleCancel);

  // Message handlers
  // Handle text messages in priority order:
  // 1. Confirmation flow input (ISBN/title/author)
  // 2. Regular review message
  bot.on(message("text"), async (ctx, next) => {
    // Priority 1: Confirmation flow input
    const handledConfirmation = await handleConfirmationTextInput(ctx);
    if (handledConfirmation) {
      return; // Stop here, handled by confirmation flow
    }

    // Continue to review message handler
    return next();
  });
  bot.on(message("text"), handleReviewMessage);

  // Also handle media messages with captions (photo, video, document, etc.)
  // These can contain review hashtags in their captions
  bot.on(message("photo"), handleReviewMessage);
  bot.on(message("video"), handleReviewMessage);
  bot.on(message("document"), handleReviewMessage);
  bot.on(message("animation"), handleReviewMessage);
  bot.on(message("audio"), handleReviewMessage);
  bot.on(message("voice"), handleReviewMessage);
  bot.on(message("video_note"), handleReviewMessage);

  return bot;
}

export async function startBot(bot: Telegraf) {
  // Initialize notification service
  initNotificationService(bot);

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  // Set bot commands for menu
  await bot.telegram.setMyCommands([
    { command: "start", description: "Запустить бота и увидеть приветствие" },
    { command: "review", description: "Отметить сообщение как рецензию" },
  ]);

  console.log("Starting bot...");

  // Send startup notification before launch (since launch might not resolve in some environments)
  // Skip notification during tests
  if (config.adminChatId && !config.isTest) {
    await sendSuccessNotification("Bot starting up", {
      operation: "Bot Startup",
      additionalInfo: `Environment: ${config.isDev ? "development" : "production"}`,
    });
  }

  await bot.launch();
  console.log("Bot started successfully!");
}
