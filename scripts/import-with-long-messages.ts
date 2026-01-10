import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { extractBookInfo } from "../src/services/llm.js";
import { searchBookByTitleAndAuthor } from "../src/services/googlebooks.js";
import { analyzeSentiment } from "../src/services/sentiment.js";
import { config } from "../src/lib/config.js";

// Parse command line arguments
const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const chatIdIndex = args.indexOf("--chat-id");
const dryRun = args.includes("--dry-run");
const skipSentiment = args.includes("--skip-sentiment");
const verbose = args.includes("--verbose");
const topPercentIndex = args.indexOf("--top-percent");

const inputFile = inputIndex !== -1 ? args[inputIndex + 1] : null;
const chatId = chatIdIndex !== -1 ? args[chatIdIndex + 1] : null;
const topPercent = topPercentIndex !== -1 ? parseFloat(args[topPercentIndex + 1]) : 5;

if (!inputFile) {
  console.error(
    "Usage: npx tsx scripts/import-with-long-messages.ts --input <path> --chat-id <id> [--top-percent 5] [--dry-run] [--skip-sentiment] [--verbose]"
  );
  process.exit(1);
}

interface TelegramMessage {
  id: number;
  type: string;
  date: string;
  date_unixtime: string;
  from?: string;
  from_id?: string;
  text?: string | Array<{ type: string; text: string }>;
}

interface TelegramExport {
  name: string;
  type: string;
  id: number;
  messages: TelegramMessage[];
}

const REVIEW_HASHTAG = process.env.REVIEW_HASHTAG || "#рецензия";

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

function extractTextContent(text: TelegramMessage["text"]): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text.map((part) => (typeof part === "string" ? part : part.text || "")).join("");
}

function extractUserId(fromId: string | undefined): bigint {
  if (!fromId) return BigInt(0);
  // Telegram exports user IDs as "user123456789"
  const match = fromId.match(/user(\d+)/);
  return match ? BigInt(match[1]) : BigInt(0);
}

/**
 * Use OpenAI to determine if a message is a standalone book review
 * (not just a book discussion or mention)
 */
async function isBookReview(text: string): Promise<boolean> {
  const systemPrompt = `You are a helpful assistant that determines if a text is a standalone book review.
A book review should:
- Provide opinions, analysis, or evaluation of a specific book
- Contain substantive commentary (not just a brief mention or question)
- Be focused on the book itself (plot, characters, writing style, themes, etc.)

NOT a book review:
- Brief book mentions or recommendations without detailed commentary
- General discussions about books or reading
- Questions about books
- Lists of books without detailed reviews
- Short comments like "I liked it" or "Good book"

Respond with JSON format only:
{
  "isReview": true/false,
  "confidence": "high" | "medium" | "low",
  "reason": "Brief explanation"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Is this a book review?\n\n${text}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return false;
    }

    const parsed = JSON.parse(content);

    if (verbose) {
      console.log(`  Review detection: ${parsed.isReview ? "YES" : "NO"} (${parsed.confidence}) - ${parsed.reason}`);
    }

    return parsed.isReview === true;
  } catch (error) {
    console.error("Error detecting book review:", error);
    return false;
  }
}

async function processMessage(
  message: TelegramMessage,
  isFromHashtag: boolean
): Promise<{
  success: boolean;
  error?: string;
  bookTitle?: string;
}> {
  const textContent = extractTextContent(message.text);

  const telegramUserId = extractUserId(message.from_id);
  const messageId = BigInt(message.id);
  const reviewedAt = new Date(parseInt(message.date_unixtime, 10) * 1000);

  // Check for duplicate
  const existing = await prisma.review.findFirst({
    where: {
      telegramUserId,
      messageId,
    },
  });

  if (existing) {
    return { success: false, error: "Duplicate review" };
  }

  if (verbose) {
    console.log(`Processing message ${message.id} from ${message.from || "Unknown"}`);
    console.log(`  Source: ${isFromHashtag ? "Hashtag" : "Long message (OpenAI filtered)"}`);
  }

  // Extract book info
  const bookInfo = await extractBookInfo(textContent);

  if (!bookInfo) {
    if (verbose) {
      console.log(`  Could not extract book info`);
    }

    if (!dryRun) {
      await prisma.review.create({
        data: {
          telegramUserId,
          telegramDisplayName: message.from || null,
          reviewText: textContent,
          messageId,
          chatId: chatId ? BigInt(chatId) : null,
          reviewedAt,
        },
      });
    }

    return { success: true, error: "No book info extracted" };
  }

  if (verbose) {
    console.log(`  Book: "${bookInfo.title}" by ${bookInfo.author || "Unknown"}`);
  }

  // Find or create book
  let bookId: number | null = null;

  if (!dryRun) {
    // Check for existing book
    const existingBook = await prisma.book.findFirst({
      where: {
        title: {
          contains: bookInfo.title,
        },
      },
    });

    if (existingBook) {
      bookId = existingBook.id;
      if (verbose) {
        console.log(`  Found existing book: ${existingBook.title}`);
      }
    } else {
      // Search Google Books
      const googleBook = await searchBookByTitleAndAuthor(
        bookInfo.title,
        bookInfo.author || undefined
      );

      if (googleBook) {
        // Check if Google Books ID already exists
        const existingGoogleBook = await prisma.book.findUnique({
          where: { googleBooksId: googleBook.googleBooksId },
        });

        if (existingGoogleBook) {
          bookId = existingGoogleBook.id;
        } else {
          const newBook = await prisma.book.create({
            data: {
              title: googleBook.title,
              author: googleBook.author,
              googleBooksId: googleBook.googleBooksId,
              googleBooksUrl: googleBook.googleBooksUrl,
              coverUrl: googleBook.coverUrl,
              genres: googleBook.genres ? JSON.stringify(googleBook.genres) : null,
              publicationYear: googleBook.publicationYear,
              description: googleBook.description,
              isbn: googleBook.isbn,
              pageCount: googleBook.pageCount,
            },
          });
          bookId = newBook.id;
          if (verbose) {
            console.log(`  Created new book from Google Books: ${newBook.title}`);
          }
        }
      } else {
        // Create book with basic info
        const newBook = await prisma.book.create({
          data: {
            title: bookInfo.title,
            author: bookInfo.author,
          },
        });
        bookId = newBook.id;
        if (verbose) {
          console.log(`  Created new book: ${newBook.title}`);
        }
      }
    }
  }

  // Analyze sentiment
  let sentiment: string | null = null;
  if (!skipSentiment) {
    sentiment = await analyzeSentiment(textContent);
    if (verbose) {
      console.log(`  Sentiment: ${sentiment}`);
    }
  }

  // Create review
  if (!dryRun) {
    await prisma.review.create({
      data: {
        bookId,
        telegramUserId,
        telegramDisplayName: message.from || null,
        reviewText: textContent,
        sentiment,
        messageId,
        chatId: chatId ? BigInt(chatId) : null,
        reviewedAt,
      },
    });
  }

  return { success: true, bookTitle: bookInfo.title };
}

async function main() {
  console.log("Book Club Archive Import (Enhanced)");
  console.log("====================================");
  console.log(`Input file: ${inputFile}`);
  console.log(`Chat ID: ${chatId || "Not specified"}`);
  console.log(`Top ${topPercent}% longest messages will be analyzed`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Skip sentiment: ${skipSentiment}`);
  console.log(`Review hashtag: ${REVIEW_HASHTAG}`);
  console.log("");

  // Read and parse input file
  let data: TelegramExport;
  try {
    const content = readFileSync(inputFile!, "utf-8");
    data = JSON.parse(content);
  } catch (error) {
    console.error(`Failed to read input file: ${error}`);
    process.exit(1);
  }

  console.log(`Chat name: ${data.name}`);
  console.log(`Total messages: ${data.messages.length}`);
  console.log("");

  // Filter out service messages and extract text content for all messages
  const validMessages = data.messages
    .filter((m) => m.type === "message")
    .map((m) => ({
      message: m,
      text: extractTextContent(m.text),
    }))
    .filter((m) => m.text.length > 0);

  console.log(`Valid text messages: ${validMessages.length}`);

  // Step 1: Find messages with hashtag
  const hashtagMessages = validMessages.filter((m) =>
    m.text.includes(REVIEW_HASHTAG)
  );

  console.log(`Found ${hashtagMessages.length} messages with ${REVIEW_HASHTAG}`);

  // Step 2: Calculate top N% longest messages (excluding hashtag messages)
  const messagesWithoutHashtag = validMessages.filter(
    (m) => !m.text.includes(REVIEW_HASHTAG)
  );

  // Sort by length descending
  messagesWithoutHashtag.sort((a, b) => b.text.length - a.text.length);

  // Get top N%
  const topCount = Math.ceil(messagesWithoutHashtag.length * (topPercent / 100));
  const longMessages = messagesWithoutHashtag.slice(0, topCount);

  console.log(`Analyzing top ${topPercent}% (${topCount}) longest messages...`);
  console.log(
    `Length range: ${longMessages[longMessages.length - 1]?.text.length || 0} - ${
      longMessages[0]?.text.length || 0
    } characters`
  );
  console.log("");

  // Step 3: Filter long messages using OpenAI
  console.log("Filtering long messages with OpenAI...");
  const reviewFromLongMessages: typeof longMessages = [];

  for (let i = 0; i < longMessages.length; i++) {
    const msgData = longMessages[i];
    console.log(
      `[${i + 1}/${longMessages.length}] Checking message ${msgData.message.id} (${msgData.text.length} chars)...`
    );

    const isReview = await isBookReview(msgData.text);

    if (isReview) {
      reviewFromLongMessages.push(msgData);
      if (!verbose) {
        console.log(`  -> Identified as review`);
      }
    } else {
      if (!verbose) {
        console.log(`  -> Not a review`);
      }
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("");
  console.log(`Found ${reviewFromLongMessages.length} reviews from long messages`);
  console.log("");

  // Step 4: Combine all reviews
  const allReviewMessages = [
    ...hashtagMessages.map((m) => ({ ...m, isFromHashtag: true })),
    ...reviewFromLongMessages.map((m) => ({ ...m, isFromHashtag: false })),
  ];

  // Remove duplicates by message ID
  const uniqueReviews = Array.from(
    new Map(allReviewMessages.map((m) => [m.message.id, m])).values()
  );

  console.log(`Total unique reviews to process: ${uniqueReviews.length}`);
  console.log(`  - From hashtags: ${hashtagMessages.length}`);
  console.log(`  - From long messages: ${reviewFromLongMessages.length}`);
  console.log("");

  if (uniqueReviews.length === 0) {
    console.log("No reviews to import.");
    return;
  }

  // Step 5: Process each review
  const stats = {
    total: uniqueReviews.length,
    success: 0,
    failed: 0,
    duplicates: 0,
    noBookInfo: 0,
    fromHashtag: 0,
    fromLongMessage: 0,
  };

  for (let i = 0; i < uniqueReviews.length; i++) {
    const { message, isFromHashtag } = uniqueReviews[i];
    console.log(`[${i + 1}/${uniqueReviews.length}] Processing message ${message.id}...`);

    try {
      const result = await processMessage(message, isFromHashtag);

      if (result.success) {
        stats.success++;
        if (result.error === "No book info extracted") {
          stats.noBookInfo++;
        }
        if (isFromHashtag) {
          stats.fromHashtag++;
        } else {
          stats.fromLongMessage++;
        }
      } else {
        if (result.error === "Duplicate review") {
          stats.duplicates++;
        } else {
          stats.failed++;
        }
      }

      if (!verbose && result.bookTitle) {
        console.log(`  -> ${result.bookTitle}`);
      }
    } catch (error) {
      console.error(`  Error: ${error}`);
      stats.failed++;
    }

    // Rate limiting - wait between API calls
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("");
  console.log("Import Summary");
  console.log("==============");
  console.log(`Total processed: ${stats.total}`);
  console.log(`Successful: ${stats.success}`);
  console.log(`  - With book info: ${stats.success - stats.noBookInfo}`);
  console.log(`  - Without book info: ${stats.noBookInfo}`);
  console.log(`  - From hashtags: ${stats.fromHashtag}`);
  console.log(`  - From long messages: ${stats.fromLongMessage}`);
  console.log(`Duplicates skipped: ${stats.duplicates}`);
  console.log(`Failed: ${stats.failed}`);

  if (dryRun) {
    console.log("");
    console.log("This was a dry run. No data was saved.");
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
