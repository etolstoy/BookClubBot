import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../lib/config.js";
import { chatFilter, errorHandler } from "./middleware/auth.js";
import { handleReviewMessage, handleReviewCommand } from "./handlers/review.js";
import {
  handleStartCommand,
  handleStatsCommand,
} from "./handlers/commands.js";
import {
  handleBookConfirmed,
  handleBookAlternative,
  handleBookISBN,
  handleISBNInput,
  handlePendingReviewISBN,
} from "./handlers/book-selection.js";
import { initNotificationService, sendSuccessNotification } from "../services/notification.service.js";

export function createBot() {
  const bot = new Telegraf(config.botToken);

  // Middleware
  bot.use(errorHandler);
  bot.use(chatFilter);

  // Commands
  bot.command("start", handleStartCommand);
  bot.command("stats", handleStatsCommand);
  bot.command("review", handleReviewCommand);

  // Callback query handlers for book selection
  bot.action(/^book_confirmed:/, handleBookConfirmed);
  bot.action(/^book_alternative:/, handleBookAlternative);
  bot.action(/^book_isbn:/, handleBookISBN);

  // Message handlers
  // Handle text messages in priority order:
  // 1. Pending review ISBN (when book extraction failed)
  // 2. Existing review ISBN update (from book selection menu)
  // 3. Regular review message
  bot.on(message("text"), async (ctx, next) => {
    // Check if this is an ISBN for a pending review (highest priority)
    const handledPendingReview = await handlePendingReviewISBN(ctx);
    if (handledPendingReview) {
      return; // Stop here, don't process as review
    }

    // Check if this is an ISBN for updating an existing review
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
    { command: "stats", description: "Посмотреть вашу статистику рецензий" },
  ]);

  console.log("Starting bot...");
  await bot.launch();
  console.log("Bot started successfully!");

  // Send startup notification
  if (config.adminChatId) {
    await sendSuccessNotification("Bot started successfully", {
      operation: "Bot Startup",
      additionalInfo: `Environment: ${config.isDev ? "development" : "production"}`,
    });
  }
}
