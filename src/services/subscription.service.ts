import prisma from "../lib/prisma.js";

/**
 * Get a user's subscription by their Telegram user ID
 */
export async function getSubscription(telegramUserId: bigint) {
  return prisma.subscription.findUnique({
    where: { telegramUserId },
  });
}

/**
 * Create a new subscription (defaults to active)
 */
export async function createSubscription(
  telegramUserId: bigint
): Promise<{ isActive: boolean }> {
  const created = await prisma.subscription.create({
    data: { telegramUserId },
  });
  return { isActive: created.isActive };
}

/**
 * Toggle a user's subscription status
 * Creates subscription if it doesn't exist, otherwise toggles isActive
 * Returns the new subscription state
 */
export async function toggleSubscription(
  telegramUserId: bigint
): Promise<{ isActive: boolean }> {
  const existing = await prisma.subscription.findUnique({
    where: { telegramUserId },
  });

  if (existing) {
    const updated = await prisma.subscription.update({
      where: { telegramUserId },
      data: { isActive: !existing.isActive },
    });
    return { isActive: updated.isActive };
  }

  // Create new subscription (defaults to active)
  const created = await prisma.subscription.create({
    data: { telegramUserId },
  });
  return { isActive: created.isActive };
}

/**
 * Get all active subscriber Telegram user IDs
 */
export async function getActiveSubscribers(): Promise<bigint[]> {
  const subscriptions = await prisma.subscription.findMany({
    where: { isActive: true },
    select: { telegramUserId: true },
  });

  return subscriptions.map((s) => s.telegramUserId);
}

/**
 * Get the total count of active subscribers
 */
export async function getSubscriberCount(): Promise<number> {
  return prisma.subscription.count({
    where: { isActive: true },
  });
}

/**
 * Deactivate a user's subscription (e.g., when bot is blocked)
 */
export async function deactivateSubscription(
  telegramUserId: bigint
): Promise<void> {
  await prisma.subscription.updateMany({
    where: { telegramUserId, isActive: true },
    data: { isActive: false },
  });
}
