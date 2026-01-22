import { Context, MiddlewareFn } from "telegraf";
import { config } from "../../lib/config.js";
import { sendErrorNotification } from "../../services/notification.service.js";

export const chatFilter: MiddlewareFn<Context> = async (ctx, next) => {
  // If no target chat ID is configured, allow all chats
  if (!config.targetChatId) {
    return next();
  }

  // Determine the chat - for callback queries, use the message's chat
  let chat = ctx.chat;

  // For callback queries, get chat from the associated message
  if (!chat && "callback_query" in ctx.update && ctx.update.callback_query) {
    const cbQuery = ctx.update.callback_query;
    if ("message" in cbQuery && cbQuery.message) {
      chat = cbQuery.message.chat;
    }
  }

  if (!chat) {
    console.log("[ChatFilter] No chat found, blocking update", {
      updateType: ctx.updateType,
      updateId: ctx.update.update_id,
    });
    return;
  }

  // Allow messages from the target chat
  if (BigInt(chat.id) === config.targetChatId) {
    return next();
  }

  // Allow private messages (for commands like /start, /help)
  if (chat.type === "private") {
    return next();
  }

  // Ignore messages from other chats
  console.log("[ChatFilter] Blocking update from non-target chat", {
    chatId: chat.id,
    targetChatId: config.targetChatId.toString(),
    updateType: ctx.updateType,
  });
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
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.");
    } catch {
      // Ignore if can't send message
    }
  }
};
