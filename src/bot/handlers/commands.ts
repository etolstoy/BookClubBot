import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";

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


