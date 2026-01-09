import { Context, MiddlewareFn } from "telegraf";
import { config } from "../../lib/config.js";
import { sendErrorNotification } from "../../services/notification.service.js";

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

    // Send error notification to admin
    if (error instanceof Error) {
      const userId = ctx.from?.id ? BigInt(ctx.from.id) : undefined;
      const messageId = ctx.message?.message_id ? BigInt(ctx.message.message_id) : undefined;

      await sendErrorNotification(error, {
        operation: "Bot Message Handler",
        userId,
        messageId,
        additionalInfo: `Chat: ${ctx.chat?.id}, Update: ${ctx.update.update_id}`,
      });
    }

    // Try to send error message to user
    try {
      await ctx.reply("An error occurred. Please try again later.");
    } catch {
      // Ignore if can't send message
    }
  }
};
