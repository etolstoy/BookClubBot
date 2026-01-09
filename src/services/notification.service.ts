import { Telegraf } from "telegraf";
import { config } from "../lib/config.js";

let botInstance: Telegraf | null = null;

/**
 * Initialize the notification service with the bot instance
 */
export function initNotificationService(bot: Telegraf) {
  botInstance = bot;
  console.log('[Notifications] Service initialized');
}

/**
 * Send an error notification to the admin chat
 */
export async function sendErrorNotification(
  error: Error,
  context?: {
    operation?: string;
    userId?: bigint;
    messageId?: bigint;
    additionalInfo?: string;
  }
) {
  if (!config.adminChatId) {
    console.log('[Notifications] Admin chat ID not configured, skipping notification');
    return;
  }

  if (!botInstance) {
    console.error('[Notifications] Bot instance not initialized');
    return;
  }

  try {
    const errorName = error.name || 'Error';
    const errorMessage = error.message || 'Unknown error';
    const timestamp = new Date().toISOString();

    let message = `🚨 <b>Error Alert</b>\n\n`;
    message += `<b>Type:</b> ${errorName}\n`;
    message += `<b>Message:</b> ${errorMessage}\n`;
    message += `<b>Time:</b> ${timestamp}\n`;

    if (context?.operation) {
      message += `<b>Operation:</b> ${context.operation}\n`;
    }

    if (context?.userId) {
      message += `<b>User ID:</b> ${context.userId.toString()}\n`;
    }

    if (context?.messageId) {
      message += `<b>Message ID:</b> ${context.messageId.toString()}\n`;
    }

    if (context?.additionalInfo) {
      message += `<b>Info:</b> ${context.additionalInfo}\n`;
    }

    // Add stack trace in development
    if (config.isDev && error.stack) {
      const stackLines = error.stack.split('\n').slice(0, 5).join('\n');
      message += `\n<code>${stackLines}</code>`;
    }

    await botInstance.telegram.sendMessage(Number(config.adminChatId), message, {
      parse_mode: 'HTML',
    });

    console.log('[Notifications] Error notification sent to admin');
  } catch (notificationError) {
    console.error('[Notifications] Failed to send error notification:', notificationError);
  }
}

/**
 * Send a warning notification to the admin chat
 */
export async function sendWarningNotification(
  message: string,
  context?: {
    operation?: string;
    additionalInfo?: string;
  }
) {
  if (!config.adminChatId || !botInstance) {
    return;
  }

  try {
    const timestamp = new Date().toISOString();

    let notification = `⚠️ <b>Warning</b>\n\n`;
    notification += `<b>Message:</b> ${message}\n`;
    notification += `<b>Time:</b> ${timestamp}\n`;

    if (context?.operation) {
      notification += `<b>Operation:</b> ${context.operation}\n`;
    }

    if (context?.additionalInfo) {
      notification += `<b>Info:</b> ${context.additionalInfo}\n`;
    }

    await botInstance.telegram.sendMessage(Number(config.adminChatId), notification, {
      parse_mode: 'HTML',
    });

    console.log('[Notifications] Warning notification sent to admin');
  } catch (error) {
    console.error('[Notifications] Failed to send warning notification:', error);
  }
}

/**
 * Send an info notification to the admin chat
 */
export async function sendInfoNotification(
  message: string,
  context?: {
    operation?: string;
    additionalInfo?: string;
  }
) {
  if (!config.adminChatId || !botInstance) {
    return;
  }

  try {
    const timestamp = new Date().toISOString();

    let notification = `ℹ️ <b>Info</b>\n\n`;
    notification += `<b>Message:</b> ${message}\n`;
    notification += `<b>Time:</b> ${timestamp}\n`;

    if (context?.operation) {
      notification += `<b>Operation:</b> ${context.operation}\n`;
    }

    if (context?.additionalInfo) {
      notification += `<b>Info:</b> ${context.additionalInfo}\n`;
    }

    await botInstance.telegram.sendMessage(Number(config.adminChatId), notification, {
      parse_mode: 'HTML',
    });

    console.log('[Notifications] Info notification sent to admin');
  } catch (error) {
    console.error('[Notifications] Failed to send info notification:', error);
  }
}

/**
 * Send a success notification to the admin chat
 */
export async function sendSuccessNotification(
  message: string,
  context?: {
    operation?: string;
    additionalInfo?: string;
  }
) {
  if (!config.adminChatId || !botInstance) {
    return;
  }

  try {
    const timestamp = new Date().toISOString();

    let notification = `✅ <b>Success</b>\n\n`;
    notification += `<b>Message:</b> ${message}\n`;
    notification += `<b>Time:</b> ${timestamp}\n`;

    if (context?.operation) {
      notification += `<b>Operation:</b> ${context.operation}\n`;
    }

    if (context?.additionalInfo) {
      notification += `<b>Info:</b> ${context.additionalInfo}\n`;
    }

    await botInstance.telegram.sendMessage(Number(config.adminChatId), notification, {
      parse_mode: 'HTML',
    });

    console.log('[Notifications] Success notification sent to admin');
  } catch (error) {
    console.error('[Notifications] Failed to send success notification:', error);
  }
}
