import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { extractBookInfo } from "../src/services/llm.js";
import { searchBookByTitleAndAuthor } from "../src/services/googlebooks.js";
import { analyzeSentiment } from "../src/services/sentiment.js";

// Parse command line arguments
const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const chatIdIndex = args.indexOf("--chat-id");
const dryRun = args.includes("--dry-run");
const skipSentiment = args.includes("--skip-sentiment");
const verbose = args.includes("--verbose");

const inputFile = inputIndex !== -1 ? args[inputIndex + 1] : null;
const chatId = chatIdIndex !== -1 ? args[chatIdIndex + 1] : null;

if (!inputFile) {
  console.error("Usage: npx tsx scripts/import-archive.ts --input <path> --chat-id <id> [--dry-run] [--skip-sentiment] [--verbose]");
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

async function processMessage(message: TelegramMessage): Promise<{
  success: boolean;
  error?: string;
  bookTitle?: string;
}> {
  const textContent = extractTextContent(message.text);

  if (!textContent.includes(REVIEW_HASHTAG)) {
    return { success: false, error: "No review hashtag found" };
  }

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
  console.log("Book Club Archive Import");
  console.log("========================");
  console.log(`Input file: ${inputFile}`);
  console.log(`Chat ID: ${chatId || "Not specified"}`);
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

  // Filter messages with review hashtag
  const reviewMessages = data.messages.filter((m) => {
    const text = extractTextContent(m.text);
    return text.includes(REVIEW_HASHTAG);
  });

  console.log(`Found ${reviewMessages.length} messages with ${REVIEW_HASHTAG}`);
  console.log("");

  if (reviewMessages.length === 0) {
    console.log("No reviews to import.");
    return;
  }

  // Process each review
  const stats = {
    total: reviewMessages.length,
    success: 0,
    failed: 0,
    duplicates: 0,
    noBookInfo: 0,
  };

  for (let i = 0; i < reviewMessages.length; i++) {
    const message = reviewMessages[i];
    console.log(`[${i + 1}/${reviewMessages.length}] Processing message ${message.id}...`);

    try {
      const result = await processMessage(message);

      if (result.success) {
        stats.success++;
        if (result.error === "No book info extracted") {
          stats.noBookInfo++;
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
