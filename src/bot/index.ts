import { Telegraf } from "telegraf";
import { config } from "../lib/config.js";
import { chatFilter, errorHandler } from "./middleware/auth.js";
import { handleReviewMessage, handleReviewCommand } from "./handlers/review.js";
import { handleStartCommand, handleMdigestCommand, handleScountCommand } from "./handlers/commands.js";
import { handleGoodreadsCommand } from "./handlers/goodreads.js";
import {
  handleSubscribeCommand,
  handleSubscriptionToggle,
  TOGGLE_CALLBACK_DATA,
} from "./handlers/subscription.js";
import { initNotificationService, sendSuccessNotification } from "../services/notification.service.js";

/**
 * Global bot instance (set by startBot)
 */
export let botInstance: Telegraf | null = null;

export function createBot() {
  const bot = new Telegraf(config.botToken, {
    handlerTimeout: config.botHandlerTimeoutMs,
  });

  // Middleware
  bot.use(errorHandler);
  bot.use(chatFilter);

  // Commands
  bot.command("start", handleStartCommand);
  bot.command("review", (ctx) => handleReviewCommand(ctx));
  bot.command("mdigest", handleMdigestCommand);
  bot.command("scount", handleScountCommand);
  bot.command("subscribe", handleSubscribeCommand);
  bot.command("goodreads", handleGoodreadsCommand);

  // Callback handlers
  bot.action(TOGGLE_CALLBACK_DATA, handleSubscriptionToggle);

  // Inspect all incoming messages; the handler ignores those without review text.
  // This also admits rich_message updates not yet covered by Telegraf's types.
  bot.on("message", (ctx) => handleReviewMessage(ctx));

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
  // Default commands (shown in all chats)
  const goodreadsCommand = {
    command: "goodreads",
    description: "Ссылки Goodreads: ответьте на рецензию",
    is_ephemeral: true,
  };
  await bot.telegram.setMyCommands([
    { command: "start", description: "Запустить бота и увидеть приветствие" },
    { command: "review", description: "Отметить сообщение как рецензию" },
    goodreadsCommand,
  ]);

  // Private chat commands (include subscription)
  await bot.telegram.setMyCommands(
    [
      { command: "start", description: "Запустить бота" },
      { command: "subscribe", description: "Подписаться на уведомления о новых рецензиях" },
    ],
    { scope: { type: "all_private_chats" } }
  );

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
