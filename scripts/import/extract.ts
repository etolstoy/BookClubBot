import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

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

export async function extract(inputFile: string, chatId: string): Promise<void> {
  const prisma = new PrismaClient();

  console.log("Staged Import: Extract Stage");
  console.log("=".repeat(70));
  console.log(`Input file: ${inputFile}`);
  console.log(`Chat ID: ${chatId}`);
  console.log(`Review hashtag: ${REVIEW_HASHTAG}`);
  console.log();

  // Read and parse the export file
  const fileContent = readFileSync(inputFile, "utf-8");
  const exportData: TelegramExport = JSON.parse(fileContent);

  console.log(`Chat name: ${exportData.name}`);
  console.log(`Total messages: ${exportData.messages.length}`);
  console.log();

  // Filter messages with review hashtag
  const reviewMessages = exportData.messages.filter((msg) => {
    const text = extractTextContent(msg.text);
    return text.includes(REVIEW_HASHTAG);
  });

  console.log(`Found ${reviewMessages.length} messages with ${REVIEW_HASHTAG}`);
  console.log();

  let staged = 0;
  let duplicatesInReviews = 0;
  let duplicatesInStaged = 0;
  let errors = 0;

  for (const message of reviewMessages) {
    try {
      const telegramUserId = extractUserId(message.from_id);
      const messageId = BigInt(message.id);
      const reviewText = extractTextContent(message.text);
      const reviewedAt = new Date(parseInt(message.date_unixtime, 10) * 1000);
      const displayName = message.from || null;
      const msgChatId = BigInt(chatId);

      // Check if already exists as a finalized Review
      const existingReview = await prisma.review.findFirst({
        where: {
          telegramUserId,
          messageId,
        },
      });

      if (existingReview) {
        duplicatesInReviews++;
        continue;
      }

      // Check if already exists as a StagedMessage
      const existingStaged = await prisma.stagedMessage.findUnique({
        where: {
          telegramUserId_messageId: {
            telegramUserId,
            messageId,
          },
        },
      });

      if (existingStaged) {
        duplicatesInStaged++;
        continue;
      }

      // Create StagedMessage
      await prisma.stagedMessage.create({
        data: {
          messageId,
          telegramUserId,
          displayName,
          reviewText,
          chatId: msgChatId,
          reviewedAt,
          status: "pending",
        },
      });

      staged++;

      // Show progress every 50 messages
      if (staged % 50 === 0) {
        console.log(`Staged ${staged} messages...`);
      }
    } catch (error) {
      console.error(`Error staging message ${message.id}:`, error);
      errors++;
    }
  }

  console.log();
  console.log("Extract complete!");
  console.log(`  Staged: ${staged} messages`);
  console.log(`  Duplicates (already in Reviews): ${duplicatesInReviews}`);
  console.log(`  Duplicates (already staged): ${duplicatesInStaged}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}
