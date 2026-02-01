import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import { isAdmin } from "../../services/review.service.js";
import { generateMonthlyDigest } from "../../services/digest.service.js";

export async function handleStartCommand(ctx: Context) {
  // Only work in private messages
  if (ctx.chat?.type !== "private") {
    return;
  }

  const welcomeMessage = `
📚 Привет, читающий клубень!

Я бот, который помогает сохранять и искать рецензии в чате Вастрик.Книг. Вот что я умею:

• Сохранять отзывы, помеченные тегом ${config.reviewHashtag}, либо с помощью команды /review
• Показывать все книги, рецензии, популярных авторов и лидерборд самых читающих в миниаппе

Если есть идеи новых фичей, или что-то сломано – создавайте [issue на GitHub](https://github.com/etolstoy/BookClubBot)

Приятного чтения! 📖
  `.trim();

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      Markup.button.webApp("Открыть Mini App", config.miniAppUrl),
    ]),
  });
}

/**
 * Handle /mdigest command - generate and post monthly digest
 * Admin only, works in private chat
 */
export async function handleMdigestCommand(ctx: Context) {
  // Only work in private messages
  if (ctx.chat?.type !== "private") {
    return;
  }

  // Check if user is admin
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(BigInt(userId))) {
    await ctx.reply("Эта команда доступна только администраторам.");
    return;
  }

  // Check if target chat is configured
  if (!config.targetChatId) {
    await ctx.reply("Целевой чат не настроен (TARGET_CHAT_ID).");
    return;
  }

  await ctx.reply("Генерирую дайджест...");

  try {
    const digest = await generateMonthlyDigest();

    // Send digest to the target chat
    await ctx.telegram.sendMessage(Number(config.targetChatId), digest, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });

    await ctx.reply("Дайджест отправлен в чат!");
  } catch (error) {
    console.error("Error generating digest:", error);
    await ctx.reply(
      `Ошибка при генерации дайджеста: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
