import { Context, Markup } from "telegraf";
import { config } from "../../lib/config.js";
import {
  getSubscription,
  toggleSubscription,
  getSubscriberCount,
  createSubscription,
} from "../../services/subscription.service.js";

const TOGGLE_CALLBACK_DATA = "toggle_subscription";

/**
 * Check if user is an admin
 */
function isAdmin(userId: bigint): boolean {
  return config.adminUserIds.includes(userId);
}

/**
 * Build subscription status message
 */
async function buildSubscriptionMessage(
  isActive: boolean,
  userId: bigint
): Promise<{ text: string; keyboard: ReturnType<typeof Markup.inlineKeyboard> }> {
  let text: string;

  if (isActive) {
    text = "🔔 Уведомления о новых рецензиях: включены ✅";
  } else {
    text = "🔕 Уведомления о новых рецензиях: отключены";
  }

  // Add subscriber count for admins
  if (isAdmin(userId)) {
    const count = await getSubscriberCount();
    text += `\n📊 Всего подписчиков: ${count}`;
  }

  const buttonText = isActive ? "Отключить" : "Включить";
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(buttonText, TOGGLE_CALLBACK_DATA)],
  ]);

  return { text, keyboard };
}

/**
 * Handle /subscribe command
 * Shows current subscription status with toggle button
 * Only works in private chats
 */
export async function handleSubscribeCommand(ctx: Context): Promise<void> {
  // Only work in private messages
  if (ctx.chat?.type !== "private") {
    return;
  }

  const userId = ctx.from?.id;
  if (!userId) return;

  const telegramUserId = BigInt(userId);

  // Get existing subscription or create a new one
  const subscription = await getSubscription(telegramUserId);
  const isActive = subscription?.isActive ?? (await createSubscription(telegramUserId)).isActive;
  const { text, keyboard } = await buildSubscriptionMessage(isActive, telegramUserId);

  await ctx.reply(text, keyboard);
}

/**
 * Handle subscription toggle callback
 * Toggles subscription state and edits the message in-place
 */
export async function handleSubscriptionToggle(ctx: Context): Promise<void> {
  // Ensure this is a callback query
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
    return;
  }

  const userId = ctx.from?.id;
  if (!userId) return;

  const telegramUserId = BigInt(userId);

  // Toggle subscription
  const { isActive } = await toggleSubscription(telegramUserId);

  // Build new message
  const { text, keyboard } = await buildSubscriptionMessage(isActive, telegramUserId);

  // Edit message in place
  try {
    await ctx.editMessageText(text, keyboard);
  } catch (error) {
    // Message might be unchanged or too old to edit
    console.error("[Subscription] Failed to edit message:", error);
  }

  // Answer callback to remove loading state
  await ctx.answerCbQuery();
}

export { TOGGLE_CALLBACK_DATA };
