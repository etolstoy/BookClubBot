import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../lib/config.js";
import { chatFilter, errorHandler } from "./middleware/auth.js";
import { handleReviewMessage, handleReviewCommand } from "./handlers/review.js";
import { handleStartCommand, handleMdigestCommand } from "./handlers/commands.js";
import { initNotificationService, sendSuccessNotification } from "../services/notification.service.js";

/**
 * Global bot instance (set by startBot)
 */
export let botInstance: Telegraf | null = null;

export function createBot() {
  const bot = new Telegraf(config.botToken);

  // Middleware
  bot.use(errorHandler);
  bot.use(chatFilter);

  // Commands
  bot.command("start", handleStartCommand);
  bot.command("review", (ctx) => handleReviewCommand(ctx));
  bot.command("mdigest", handleMdigestCommand);

  // Message handlers
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
  // Set global bot instance
  botInstance = bot;

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
