import { Context, Markup } from "telegraf";
import { Message } from "telegraf/types";
import { config } from "../../lib/config.js";
import { getUserReviewStats, getMonthlyLeaderboard } from "../../services/review.service.js";
import { searchBooks } from "../../services/book.service.js";

export async function handleStartCommand(ctx: Context) {
  const welcomeMessage = `
📚 *Welcome to the Book Club Bot!*

I help track book reviews in this group. Here's what I can do:

• Automatically detect reviews with ${config.reviewHashtag}
• Use /review as a reply to mark any message as a review
• Browse all books and reviews in our Mini App

*Commands:*
/stats - Your personal review statistics
/leaderboard - Top reviewers this month
/search <query> - Search for a book
/help - Show this help message

Happy reading! 📖
  `.trim();

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      Markup.button.url("Open Book Catalog", config.miniAppUrl),
    ]),
  });
}

export async function handleHelpCommand(ctx: Context) {
  const helpMessage = `
📚 *Book Club Bot Commands*

*Review Commands:*
• Include ${config.reviewHashtag} in your message to save a review
• /review - Reply to a message to mark it as a review

*Stats & Discovery:*
• /stats - Your personal review statistics
• /leaderboard - Top reviewers this month
• /search <query> - Search for a book

*Mini App:*
• Browse all reviewed books
• See detailed book information
• View leaderboards and profiles

Questions? Contact the group admins.
  `.trim();

  await ctx.reply(helpMessage, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      Markup.button.url("Open Mini App", config.miniAppUrl),
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
        "You haven't written any reviews yet! Start by posting a message with " +
          config.reviewHashtag +
          " or use /review as a reply to any message."
      );
      return;
    }

    const { positive, negative, neutral } = stats.sentimentCounts;

    const statsMessage = `
📊 *Your Review Statistics*

📚 Total reviews: ${stats.totalReviews}

*Sentiment breakdown:*
👍 Positive: ${positive}
👎 Negative: ${negative}
😐 Neutral: ${neutral}
    `.trim();

    await ctx.reply(statsMessage, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        Markup.button.url(
          "View your reviews",
          `${config.miniAppUrl}?startapp=reviewer_${telegramUserId}`
        ),
      ]),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    await ctx.reply("Sorry, there was an error fetching your statistics.");
  }
}

export async function handleLeaderboardCommand(ctx: Context) {
  try {
    const now = new Date();
    const leaderboard = await getMonthlyLeaderboard(
      now.getFullYear(),
      now.getMonth() + 1,
      5
    );

    if (leaderboard.length === 0) {
      await ctx.reply("No reviews this month yet! Be the first to write one.");
      return;
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const monthName = monthNames[now.getMonth()];

    let leaderboardText = `🏆 *Top Reviewers - ${monthName} ${now.getFullYear()}*\n\n`;

    for (const entry of leaderboard) {
      const medal =
        entry.rank === 1
          ? "🥇"
          : entry.rank === 2
          ? "🥈"
          : entry.rank === 3
          ? "🥉"
          : `${entry.rank}.`;

      const name = entry.displayName || entry.username || "Anonymous";
      leaderboardText += `${medal} ${name} - ${entry.reviewCount} reviews\n`;
    }

    await ctx.reply(leaderboardText, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        Markup.button.url("Full Leaderboard", `${config.miniAppUrl}?startapp=leaderboard`),
      ]),
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    await ctx.reply("Sorry, there was an error fetching the leaderboard.");
  }
}

export async function handleSearchCommand(ctx: Context) {
  const message = ctx.message as Message.TextMessage;

  if (!message?.text) {
    return;
  }

  const query = message.text.replace(/^\/search\s*/i, "").trim();

  if (!query) {
    await ctx.reply("Please provide a search query: /search <book title or author>");
    return;
  }

  try {
    const results = await searchBooks(query, 5);

    if (results.length === 0) {
      await ctx.reply(`No books found for "${query}".`, {
        ...Markup.inlineKeyboard([
          Markup.button.url(
            "Browse all books",
            config.miniAppUrl
          ),
        ]),
      });
      return;
    }

    let resultsText = `📚 *Search results for "${query}":*\n\n`;

    for (const book of results) {
      const reviewCount = book._count.reviews;
      const reviewText = reviewCount === 1 ? "review" : "reviews";
      resultsText += `• *${book.title}*${book.author ? ` by ${book.author}` : ""} (${reviewCount} ${reviewText})\n`;
    }

    const buttons = results.slice(0, 3).map((book: { id: number; title: string }) =>
      Markup.button.url(
        book.title.length > 20 ? book.title.slice(0, 20) + "..." : book.title,
        `${config.miniAppUrl}?startapp=book_${book.id}`
      )
    );

    await ctx.reply(resultsText, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons, { columns: 1 }),
    });
  } catch (error) {
    console.error("Error searching books:", error);
    await ctx.reply("Sorry, there was an error searching for books.");
  }
}
