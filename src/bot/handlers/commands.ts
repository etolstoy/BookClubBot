import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import { getUserReviewStats } from "../../services/review.service.js";

export async function handleStartCommand(ctx: Context) {
  // Only work in private messages
  if (ctx.chat?.type !== "private") {
    return;
  }

  const welcomeMessage = `
📚 *Добро пожаловать в Бот Книжного Клуба!*

Я помогаю отслеживать рецензии на книги в вашей группе. Вот что я умею:

• Автоматически находить рецензии с ${config.reviewHashtag}
• Используйте /review как ответ на сообщение, чтобы отметить его как рецензию
• Просматривайте все книги, рецензии и таблицы лидеров в нашем Mini App

*Команды:*
/stats - Ваша личная статистика рецензий
/review - Отметить сообщение как рецензию (только в группах)

📱 *Используйте Mini App для:*
• Просмотра всех книг и рецензий
• Таблиц лидеров
• Поиска книг
• Детальной статистики

Приятного чтения! 📖
  `.trim();

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      Markup.button.url("Открыть Mini App", config.miniAppUrl),
    ]),
  });
}

export async function handleStatsCommand(ctx: Context) {
  const message = ctx.message as Message.TextMessage;

  if (!message?.from) {
    return;
  }

  const telegramUserId = BigInt(message.from.id);

  try {
    const stats = await getUserReviewStats(telegramUserId);

    if (stats.totalReviews === 0) {
      await ctx.reply(
        "Вы ещё не написали ни одной рецензии! Начните с публикации сообщения с " +
          config.reviewHashtag +
          " или используйте /review как ответ на любое сообщение."
      );
      return;
    }

    const { positive, negative, neutral } = stats.sentimentCounts;

    const statsMessage = `
📊 *Ваша статистика рецензий*

📚 Всего рецензий: ${stats.totalReviews}

*Распределение по тональности:*
👍 Положительные: ${positive}
👎 Отрицательные: ${negative}
😐 Нейтральные: ${neutral}
    `.trim();

    await ctx.reply(statsMessage, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        Markup.button.url(
          "Посмотреть ваши рецензии",
          `${config.miniAppUrl}?startapp=reviewer_${telegramUserId}`
        ),
      ]),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    await ctx.reply("Извините, произошла ошибка при получении вашей статистики.");
  }
}

