import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../lib/config.js";
import { chatFilter, errorHandler } from "./middleware/auth.js";
import { handleReviewMessage, handleReviewCommand } from "./handlers/review.js";
import {
  handleStartCommand,
  handleHelpCommand,
  handleStatsCommand,
  handleLeaderboardCommand,
  handleSearchCommand,
} from "./handlers/commands.js";
import { initNotificationService, sendSuccessNotification } from "../services/notification.service.js";

export function createBot() {
  const bot = new Telegraf(config.botToken);

  // Middleware
  bot.use(errorHandler);
  bot.use(chatFilter);

  // Commands
  bot.command("start", handleStartCommand);
  bot.command("help", handleHelpCommand);
  bot.command("stats", handleStatsCommand);
  bot.command("leaderboard", handleLeaderboardCommand);
  bot.command("search", handleSearchCommand);
  bot.command("review", handleReviewCommand);

  // Message handlers
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
    { command: "start", description: "Start the bot and see welcome message" },
    { command: "review", description: "Mark a replied message as a review" },
    { command: "stats", description: "View your review statistics" },
    { command: "leaderboard", description: "See top reviewers this month" },
    { command: "search", description: "Search for a book" },
    { command: "help", description: "Show help and available commands" },
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
