import { Telegraf } from 'telegraf';

/**
 * Check if a user is a member of the target chat.
 * Returns true if the user is a member, administrator, or creator.
 * Returns false if the user is not a member, if chatId is undefined, or if an error occurs.
 */
export async function checkChatMembership(
  bot: Telegraf,
  chatId: bigint | undefined,
  userId: bigint
): Promise<boolean> {
  if (!chatId) {
    return false;
  }

  try {
    const member = await bot.telegram.getChatMember(
      Number(chatId),
      Number(userId)
    );
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Error checking chat membership:', error);
    return false;
  }
}
