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
  bot.command("review", (ctx) => handleReviewCommand(ctx));

  // Callback query handlers for confirmation flow
  bot.action(/^confirm_book:/, (ctx) => handleBookSelected(ctx));
  bot.action(/^confirm_isbn$/, (ctx) => handleIsbnRequested(ctx));
  bot.action(/^confirm_manual$/, (ctx) => handleManualEntryRequested(ctx));
  bot.action(/^confirm_extracted$/, (ctx) => handleExtractedBookConfirmed(ctx));
  bot.action(/^confirm_cancel$/, (ctx) => handleCancel(ctx));

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
  bot.on(message("text"), (ctx) => handleReviewMessage(ctx));

  // Also handle media messages with captions (photo, video, document, etc.)
  // These can contain review hashtags in their captions
  bot.on(message("photo"), (ctx) => handleReviewMessage(ctx));
  bot.on(message("video"), (ctx) => handleReviewMessage(ctx));
  bot.on(message("document"), (ctx) => handleReviewMessage(ctx));
  bot.on(message("animation"), (ctx) => handleReviewMessage(ctx));
  bot.on(message("audio"), (ctx) => handleReviewMessage(ctx));
  bot.on(message("voice"), (ctx) => handleReviewMessage(ctx));
  bot.on(message("video_note"), (ctx) => handleReviewMessage(ctx));

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
