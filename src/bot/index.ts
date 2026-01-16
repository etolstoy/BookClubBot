import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../lib/config.js";
import { chatFilter, errorHandler } from "./middleware/auth.js";
import { handleReviewMessage, handleReviewCommand } from "./handlers/review.js";
import {
  handleStartCommand,
} from "./handlers/commands.js";
import {
  handleBookConfirmed,
  handleBookAlternative,
  handleBookISBN,
  handleISBNInput,
  handlePendingReviewISBN,
} from "./handlers/book-selection.js";
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

  // Callback query handlers for book selection (old flow - kept for backward compatibility)
  bot.action(/^book_confirmed:/, handleBookConfirmed);
  bot.action(/^book_alternative:/, handleBookAlternative);
  bot.action(/^book_isbn:/, handleBookISBN);

  // Callback query handlers for new confirmation flow
  bot.action(/^confirm_book:/, handleBookSelected);
  bot.action(/^confirm_isbn$/, handleIsbnRequested);
  bot.action(/^confirm_manual$/, handleManualEntryRequested);
  bot.action(/^confirm_extracted$/, handleExtractedBookConfirmed);
  bot.action(/^confirm_cancel$/, handleCancel);

  // Message handlers
  // Handle text messages in priority order:
  // 1. Confirmation flow input (ISBN/title/author from new flow)
  // 2. Pending review ISBN (when book extraction failed - old flow)
  // 3. Existing review ISBN update (from book selection menu - old flow)
  // 4. Regular review message
  bot.on(message("text"), async (ctx, next) => {
    // Priority 1: Confirmation flow input (new flow)
    const handledConfirmation = await handleConfirmationTextInput(ctx);
    if (handledConfirmation) {
      return; // Stop here, handled by confirmation flow
    }

    // Priority 2: Check if this is an ISBN for a pending review (old flow)
    const handledPendingReview = await handlePendingReviewISBN(ctx);
    if (handledPendingReview) {
      return; // Stop here, don't process as review
    }

    // Priority 3: Check if this is an ISBN for updating an existing review (old flow)
    await handleISBNInput(ctx);

    // Continue to review message handler
    return next();
  });
  bot.on(message("text"), handleReviewMessage);

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
  if (config.adminChatId) {
    await sendSuccessNotification("Bot starting up", {
      operation: "Bot Startup",
      additionalInfo: `Environment: ${config.isDev ? "development" : "production"}`,
    });
  }

  await bot.launch();
  console.log("Bot started successfully!");
}
