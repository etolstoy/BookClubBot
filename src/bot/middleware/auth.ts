import { Context, MiddlewareFn } from "telegraf";
import { config } from "../../lib/config.js";

export const chatFilter: MiddlewareFn<Context> = async (ctx, next) => {
  // If no target chat ID is configured, allow all chats
  if (!config.targetChatId) {
    return next();
  }

  // Allow messages from the target chat
  if (ctx.chat && BigInt(ctx.chat.id) === config.targetChatId) {
    return next();
  }

  // Allow private messages (for commands like /start, /help)
  if (ctx.chat?.type === "private") {
    return next();
  }

  // Ignore messages from other chats
  return;
};

export const errorHandler: MiddlewareFn<Context> = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error("Bot error:", error);

    // Try to send error message to user
    try {
      await ctx.reply("An error occurred. Please try again later.");
    } catch {
      // Ignore if can't send message
    }
  }
};
