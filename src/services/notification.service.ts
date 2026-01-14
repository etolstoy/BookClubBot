import { Telegraf } from "telegraf";
import { config } from "../lib/config.js";

let botInstance: Telegraf | null = null;

type NotificationLevel = "error" | "warning" | "info" | "success";

interface NotificationContext {
  operation?: string;
  userId?: bigint;
  messageId?: bigint;
  additionalInfo?: string;
}

const NOTIFICATION_CONFIG: Record<NotificationLevel, { emoji: string; title: string }> = {
  error: { emoji: "\u{1F6A8}", title: "Error Alert" },
  warning: { emoji: "\u26A0\uFE0F", title: "Warning" },
  info: { emoji: "\u2139\uFE0F", title: "Info" },
  success: { emoji: "\u2705", title: "Success" },
};

/**
 * Initialize the notification service with the bot instance
 */
export function initNotificationService(bot: Telegraf): void {
  botInstance = bot;
  console.log("[Notifications] Service initialized");
}

/**
 * Core notification function - sends formatted message to admin chat
 */
async function sendNotification(
  level: NotificationLevel,
  message: string,
  context?: NotificationContext,
  error?: Error
): Promise<void> {
  if (!config.adminChatId || !botInstance) {
    if (!config.adminChatId) {
      console.log("[Notifications] Admin chat ID not configured, skipping notification");
    }
    return;
  }

  try {
    const { emoji, title } = NOTIFICATION_CONFIG[level];
    const timestamp = new Date().toISOString();

    let notification = `${emoji} <b>${title}</b>\n\n`;

    if (error) {
      notification += `<b>Type:</b> ${error.name || "Error"}\n`;
    }
    notification += `<b>Message:</b> ${message}\n`;
    notification += `<b>Time:</b> ${timestamp}\n`;

    if (context?.operation) {
      notification += `<b>Operation:</b> ${context.operation}\n`;
    }
    if (context?.userId) {
      notification += `<b>User ID:</b> ${context.userId.toString()}\n`;
    }
    if (context?.messageId) {
      notification += `<b>Message ID:</b> ${context.messageId.toString()}\n`;
    }
    if (context?.additionalInfo) {
      notification += `<b>Info:</b> ${context.additionalInfo}\n`;
    }

    // Add stack trace in development for errors
    if (config.isDev && error?.stack) {
      const stackLines = error.stack.split("\n").slice(0, 5).join("\n");
      notification += `\n<code>${stackLines}</code>`;
    }

    await botInstance.telegram.sendMessage(Number(config.adminChatId), notification, {
      parse_mode: "HTML",
    });

    console.log(`[Notifications] ${title} notification sent to admin`);
  } catch (notificationError) {
    console.error(`[Notifications] Failed to send ${level} notification:`, notificationError);
  }
}

/**
 * Send an error notification to the admin chat
 */
export async function sendErrorNotification(
  error: Error,
  context?: NotificationContext
): Promise<void> {
  await sendNotification("error", error.message || "Unknown error", context, error);
}

/**
 * Send a warning notification to the admin chat
 */
export async function sendWarningNotification(
  message: string,
  context?: Omit<NotificationContext, "userId" | "messageId">
): Promise<void> {
  await sendNotification("warning", message, context);
}

/**
 * Send an info notification to the admin chat
 */
export async function sendInfoNotification(
  message: string,
  context?: Omit<NotificationContext, "userId" | "messageId">
): Promise<void> {
  await sendNotification("info", message, context);
}

/**
 * Send a success notification to the admin chat
 */
export async function sendSuccessNotification(
  message: string,
  context?: Omit<NotificationContext, "userId" | "messageId">
): Promise<void> {
  await sendNotification("success", message, context);
}
